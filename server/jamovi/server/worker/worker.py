import os
import sys
import signal

from typing import Callable
from typing import cast
from typing import Sequence
from typing import TextIO

from asyncio import StreamReader
from asyncio import StreamReaderProtocol
from asyncio import wait_for
from asyncio import IncompleteReadError
from asyncio import create_task
from asyncio import sleep
from asyncio import Task
from asyncio import get_event_loop
from asyncio import Event
from asyncio import wait
from asyncio import FIRST_COMPLETED
from asyncio import CancelledError


from rpy2.robjects import r
from rpy2.robjects import Environment
from rpy2.robjects.vectors import StrVector
from rpy2.robjects.vectors import IntVector
from rpy2.robjects.vectors import BoolVector
from rpy2.robjects.vectors import ByteVector
from rpy2.rinterface import rternalize
from rpy2.rinterface_lib.embedded import RRuntimeError

from jamovi.server.engine.error import create_error_results
from jamovi.server.jamovi_pb2 import ComsMessage
from jamovi.server.jamovi_pb2 import AnalysisRequest
from jamovi.server.jamovi_pb2 import Status as AnalysisStatus
from jamovi.server.logging import logger

logger.remove()
logger.add(sys.stderr, level="DEBUG")

STATUS_COMPLETE = AnalysisStatus.Value("COMPLETE")
STATUS_IN_PROGRESS = AnalysisStatus.Value("IN_PROGRESS")

PERFORM_INIT = AnalysisRequest.Perform.Value("INIT")
PERFORM_RUN = AnalysisRequest.Perform.Value("RUN")
PERFORM_SAVE = AnalysisRequest.Perform.Value("SAVE")


async def textio_to_stream(textio: TextIO) -> StreamReader:
    """convert a TextIO to a StreamReader"""
    loop = get_event_loop()
    reader = StreamReader()
    protocol = StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, textio)
    return reader


class Worker:
    """worker runs analyses"""

    _work_path: str
    _module_roots: Sequence[str]
    _r_libs: str
    _reader: StreamReader
    _writer: TextIO
    __reader: TextIO

    _lib_paths: Callable[[StrVector], None] | None
    _create_analysis: Callable | None
    _checkpoint: Callable
    _sig_interrupt: Event

    def __init__(
        self,
        *,
        work_path: str,
        module_roots: Sequence[str],
        r_libs: str,
        reader: TextIO,
        writer: TextIO,
    ):
        self._work_path = work_path
        self._module_roots = module_roots
        self._r_libs = r_libs
        self.__reader = reader
        self._writer = writer
        self._lib_paths = None
        self._create_analysis = None
        self._checkpoint = rternalize(self.__checkpoint)
        self._sig_interrupt = Event()

        signal.signal(signal.SIGINT, self._signal)

    def _signal(self, _, __):
        self._sig_interrupt.set()

    async def run(self):
        """run the worker"""
        self._setup_module_load_path()
        self._reader = await textio_to_stream(self.__reader)

        run_task: Task = create_task(sleep(0))
        receive_task: Task = create_task(self._receive_analysis())
        signal_task: Task = create_task(self._sig_interrupt.wait())

        pending = {receive_task, signal_task}

        while True:
            done, pending = await wait(pending, return_when=FIRST_COMPLETED)

            analysis_bytes = None

            if receive_task in done:
                analysis_bytes = receive_task.result()
                if analysis_bytes is None:
                    break
                receive_task = create_task(self._receive_analysis())
                pending.add(receive_task)

            if signal_task in done:
                logger.debug("Signal received")
                self._sig_interrupt.clear()
                signal_task = create_task(self._sig_interrupt.wait())
                pending.add(signal_task)

            if not run_task.done():
                logger.debug("cancelling old analysis")
                run_task.cancel()

            if analysis_bytes:
                run_task = create_task(self._run_analysis(analysis_bytes))

        for task in pending:
            task.cancel()
        if not run_task.done():
            run_task.cancel()

    def _send_analysis(self, analysis: Environment, complete: bool) -> None:
        results = self._get_results(analysis, complete)
        self._send_results(results, complete)

    def __checkpoint(self, results: ByteVector) -> int:
        results_bytes = bytes(results)
        self._send_results(results_bytes, False)
        # return 0 suppresses error in rpy2
        return 0

    def _get_results(self, analysis: Environment, complete: bool) -> bytes:
        results: ByteVector = analysis["serialize"](final=BoolVector((complete,)))
        return bytes(results)

    def _send_results(self, results: bytes, complete: bool) -> None:
        message = ComsMessage()
        message.payload = results
        message.payloadType = "AnalysisResponse"
        message.status = STATUS_COMPLETE if complete else STATUS_IN_PROGRESS
        message_bytes: bytes = message.SerializeToString()

        message_size = len(message_bytes)
        message_size_bytes = message_size.to_bytes(4, "little")

        self._writer.buffer.write(message_size_bytes)
        self._writer.buffer.write(message_bytes)
        self._writer.flush()

    async def _receive_analysis(self) -> bytes | None:
        try:
            payload_size_bytes = await self._reader.readexactly(4)
            payload_size = int.from_bytes(payload_size_bytes, "little")
        except IncompleteReadError:
            # EOF
            return None

        try:
            return await wait_for(self._reader.readexactly(payload_size), timeout=1)
        except TimeoutError:
            # having received the payload_size above, the payload body
            # should follow immediately ... timeout means the coms are
            # out of sync (and we should abort this worker)
            return None
        except IncompleteReadError:
            # EOF
            return None

    def _setup_module_load_path(self, module_name: str = "jmv"):
        if self._lib_paths is None:
            self._lib_paths = cast(Callable[[StrVector], None], r("base::.libPaths"))
        base_path = f"{ self._module_roots[0] }/base/R"
        jmv_path = f"{ self._module_roots[0] }/jmv/R"
        paths = list(
            map(lambda root: f"{ root }/{ module_name }/R", self._module_roots)
        )
        paths.append(jmv_path)
        paths.append(base_path)
        paths.append(self._r_libs)

        self._lib_paths(StrVector(paths))

    def _construct_analysis(self, request: AnalysisRequest) -> Environment:
        if self._create_analysis is None:
            self._create_analysis = cast(Callable, r("jmvcore::create"))
        options = request.options.SerializeToString()
        analysis = self._create_analysis(
            StrVector([request.ns]),
            StrVector([request.name]),
            ByteVector(options),
            StrVector([request.instanceId]),
            IntVector([request.analysisId]),
            IntVector([request.revision]),
        )
        return analysis

    async def _run_analysis(self, payload_bytes: bytes) -> None:
        # this function has many sleep(0)s to allow it to be cancelled

        message = ComsMessage()
        message.ParseFromString(payload_bytes)

        request = AnalysisRequest()
        request.ParseFromString(message.payload)

        session_id = request.sessionId
        instance_id = request.instanceId
        dataset_id = "0"  # request.datasetId
        analysis_id = request.analysisId
        perform = request.perform

        instance_path = f"{ self._work_path }/{ session_id }/{ instance_id }"
        store_path = f"{ instance_path }/buffer"
        analysis_name = f"{ analysis_id } { request.name }"
        analysis_path = f"{ instance_path }/{ analysis_name }"
        analysis_state_path = f"{ analysis_path }/analysis"
        analysis_resources_root_path = instance_path
        analysis_resources_rel_path = f"{ analysis_name }/resources"
        analysis_resources_abs_path = (
            f"{ analysis_resources_root_path }/{ analysis_resources_rel_path }"
        )

        os.makedirs(analysis_path, exist_ok=True)
        os.makedirs(analysis_resources_abs_path, exist_ok=True)

        module_name = request.ns
        self._setup_module_load_path(module_name)

        try:
            analysis = self._construct_analysis(request)

            await sleep(0)

            state_path = r(f"""
                function() {{
                    "{ analysis_state_path }"
                }}
            """)

            await sleep(0)

            resources_path = r(f"""
                function(name, ext) {{
                    path <- tempfile(pattern="", tmpdir="{ analysis_resources_abs_path }", fileext=ext)
                    d1 <- dirname(path)
                    b1 <- basename(path)
                    list(
                        rootPath="{ analysis_resources_root_path }",
                        relPath=file.path("{ analysis_resources_rel_path }", basename(path)))
                }}
            """)

            await sleep(0)

            read_dataset = r(f"""
                function(columns, header_only, requires_missings) {{
                    if (length(columns) == 0)
                        return(data.frame())

                    con <- DBI::dbConnect(duckdb::duckdb(), dbdir = "{ store_path }", read_only=TRUE)
                    on.exit(DBI::dbDisconnect(con, shutdown=TRUE), add=TRUE)

                    column_defs <- DBI::dbGetQuery(con, paste0("
                        SELECT iid, name, data_type, measure_type
                        FROM sheet_columns_{ dataset_id }
                        WHERE name in (", paste(rep('?', length(columns)), collapse=','), ")
                        ORDER BY index
                    "), columns)

                    column_sql <- apply(column_defs, 1, function(def) {{
                        paste0(
                            'SELECT "', def[1], '" AS "', def[2], '"',
                            ' FROM "sheet_data_{ dataset_id }" data',
                            ' ORDER BY data.index')
                    }})
                    joined <- paste0(column_sql, collapse=') POSITIONAL JOIN (')
                    sql <- paste0('SELECT * FROM (', joined, ')')
                    data <- DBI::dbGetQuery(con, sql)

                    factor_defs <- subset(column_defs, measure_type %in% c(2,3))
                    if (nrow(factor_defs) > 0) {{
                        factor_levels <- DBI::dbGetQuery(con, paste0("
                            SELECT piid, index, value, label
                            FROM sheet_levels_{ dataset_id }
                            WHERE piid in (", paste(factor_defs$iid, collapse=','), ")
                            ORDER BY index
                        "))

                        for (row in seq_len(nrow(factor_defs))) {{
                            factor_iid <- factor_defs[row,'iid']
                            factor_name <- factor_defs[row,'name']
                            factor_type <- factor_defs[row,'data_type']
                            factor_levels_this <- subset(factor_levels, factor_levels$piid == factor_iid)
                            data[[factor_name]] <- factor(
                                data[[factor_name]],
                                levels=factor_levels_this$value,
                                labels=factor_levels_this$label)
                        }}
                    }}

                    data
                }}
            """)

            await sleep(0)

            analysis[".setReadDatasetHeaderSource"](read_dataset)
            analysis[".setReadDatasetSource"](read_dataset)
            analysis[".setStatePathSource"](state_path)
            analysis[".setResourcesPathSource"](resources_path)
            analysis[".setCheckpoint"](self._checkpoint)

            analysis["init"](noThrow=BoolVector([True]))
            await sleep(0)

            if not request.clearState:
                changed = StrVector(request.changed)
                analysis[".load"](changed)
                await sleep(0)

            analysis["postInit"](noThrow=BoolVector([True]))
            await sleep(0)

            if perform == PERFORM_INIT:
                self._send_analysis(analysis, True)
                await sleep(0)
                analysis[".save"]()

            if perform == PERFORM_RUN:
                self._send_analysis(analysis, False)
                await sleep(0)
                analysis["run"](noThrow=BoolVector([True]))
                await sleep(0)
                self._send_analysis(analysis, False)
                await sleep(0)
                analysis[".createImages"](noThrow=BoolVector([True]))
                await sleep(0)
                self._send_analysis(analysis, True)
                await sleep(0)
                analysis[".save"]()

        except (RRuntimeError, CancelledError) as e:
            lang = "python" if isinstance(e, CancelledError) else "R"
            logger.debug("Analysis cancelled by SIGINT ({})", lang)
            results = create_error_results(request, "This analysis was cancelled")
            results_bytes = results.SerializeToString()
            self._send_results(results_bytes, True)
