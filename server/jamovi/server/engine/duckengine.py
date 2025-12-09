import os
import sys
import signal
import itertools

from dataclasses import dataclass
from dataclasses import field

from typing import TypeVar
from typing import Generic
from typing import Iterator

from asyncio import Event
from asyncio import Queue
from asyncio import wait_for
from asyncio import wait
from asyncio import FIRST_COMPLETED
from asyncio import create_task
from asyncio import Task
from asyncio.subprocess import create_subprocess_exec
from asyncio.subprocess import Process
from asyncio.subprocess import PIPE
from asyncio import TimeoutError
from asyncio import IncompleteReadError


import appdirs

from jamovi.server.jamovi_pb2 import AnalysisRequest
from jamovi.server.jamovi_pb2 import AnalysisResponse
from jamovi.server.jamovi_pb2 import ComsMessage
from jamovi.server.jamovi_pb2 import Status as MessageStatus

from jamovi.server.logging import logger
from jamovi.server.utils import req_str
from jamovi.server.utils import ProgressStream

from .error import create_error_results

MESSAGE_COMPLETE = MessageStatus.Value("COMPLETE")
MESSAGE_ERROR = MessageStatus.Value("ERROR")
MESSAGE_IN_PROGRESS = MessageStatus.Value("IN_PROGRESS")


@dataclass
class Analysis:
    """A request and corresponding results stream"""

    request: AnalysisRequest
    results: ProgressStream
    complete: Event = field(default_factory=Event)


T = TypeVar("T")


class SingleQueue(Queue, Generic[T]):
    """A queue which only allows a single item"""

    def __init__(self):
        super().__init__(maxsize=1)

    def put_nowait(self, item: T) -> None:
        if self.full():
            super().get_nowait()
        return super().put_nowait(item)

    async def get(self) -> T:
        return await super().get()


class DuckEngine:
    """An 'engine' process for running analyses"""

    _path: str
    _config: dict
    _analysis: Analysis | None = None
    _queue: SingleQueue[Analysis]
    _process: Process | None = None
    _process_ended: Event
    _run_loop_task: Task
    _message_id: Iterator[int]
    _stopping: bool
    _start_count = 0

    def __init__(self, path: str, config: dict):
        self._path = path
        self._config = config
        self._queue = SingleQueue()
        self._message_id = iter(itertools.count())
        self._process_ended = Event()
        self._process_ended.set()
        self._stopping = False

    @property
    def current_request(self) -> AnalysisRequest:
        """The current request being processed"""
        if self._analysis is None:
            return None
        return self._analysis.request

    async def start(self) -> None:
        """Start the worker process, and begin processing requests/results"""
        logger.debug("starting engine")

        user_data_dir = appdirs.user_data_dir("jamovi")
        user_module_path = f"{ user_data_dir }/modules"
        sys_module_path = self._config.get(
            "modules_path", os.environ.get("JAMOVI_MODULES_PATH", "")
        )
        module_paths = f"{ user_module_path }{ os.pathsep }{ sys_module_path }"

        env = os.environ.copy()
        env["R_HOME"] = self._config.get("r_home", env.get("R_HOME", ""))
        env["R_LIBS"] = self._config.get("r_libs", env.get("R_LIBS", ""))
        env["FONTCONFIG_PATH"] = self._config.get(
            "fontconfig_path", env.get("FONTCONFIG_PATH", "")
        )
        env["JAMOVI_MODULES_PATH"] = module_paths
        env["PATH"] = self._config.get("path", env.get("PATH", ""))

        self._process = await create_subprocess_exec(
            sys.executable,
            "-m",
            "jamovi.server.worker",
            "--path",
            self._path,
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
            env=env,
        )
        logger.debug("Engine process started")
        self._process_ended.clear()
        self._run_loop_task = create_task(self._run_loop())

    async def restart(self) -> None:
        """Restart the worker process"""
        await self.stop()
        await self.start()

    def run_analysis(
        self, request: AnalysisRequest, results_stream: ProgressStream
    ) -> None:
        """Run the analysis on this worker"""
        logger.opt(lazy=True).debug(
            "Worker received request {}", lambda: req_str(request)
        )
        if self._queue.full():
            prev: Analysis = self._queue.get_nowait()
            self._cancel(prev)
        analysis = Analysis(request, results_stream)
        self._queue.put_nowait(analysis)

    def _cancel(self, analysis: Analysis) -> None:
        if analysis.results.done():
            return
        results = create_error_results(
            analysis.request, "This analysis has been cancelled"
        )
        analysis.results.set_result(results)

    async def _abort_current(self) -> None:
        # abort the current analysis
        if self._analysis is None:
            return

        assert self._process is not None
        self._process.send_signal(signal.SIGINT)
        # interrupting the process should abort the analysis
        # and send 'cancelled results' back, we wait for the
        # 'cancelled results' here

        try:
            await wait_for(self._analysis.complete.wait(), timeout=1)
        except TimeoutError:
            # if the 'cancelled results' don't come, let's cancel
            # the analysis ourselves, and restart the process
            logger.debug("Cancellation not received")
            self._cancel(self._analysis)
            self._analysis = None
            await self.restart()

    async def _receive_analyses_loop(self):
        assert self._process is not None
        assert self._process.stdin is not None

        while True:
            analysis = await self._queue.get()

            if self._analysis is not None:
                logger.debug("awaiting abort current")
                await self._abort_current()
                logger.debug("current aborted")

            self._analysis = analysis
            request_bytes: bytes = analysis.request.SerializeToString()

            message = ComsMessage()
            message.id = next(self._message_id)
            message.payload = request_bytes
            message.payloadType = "AnalysisRequest"

            message_bytes = message.SerializeToString()

            message_size = len(message_bytes)
            message_size_bytes: bytes = message_size.to_bytes(4, "little")
            self._process.stdin.write(message_size_bytes)
            self._process.stdin.write(message_bytes)
            await self._process.stdin.drain()

    async def _receive_results_loop(self):
        while True:
            results, complete = await self._receive_results()
            if results is None:
                break
            self._send_results(results, complete)

    async def _run_loop(self) -> None:
        # run loop, handles all the sub tasks
        receive_analysis = create_task(self._receive_analyses_loop())
        receive_results = create_task(self._receive_results_loop())
        read_stderr = create_task(self._read_stderr())
        process_ended = create_task(self._wait_ended())
        pending = {receive_analysis, receive_results, process_ended, read_stderr}

        try:
            _, pending = await wait(pending, return_when=FIRST_COMPLETED)
        except Exception as e:
            if not self._stopping:
                logger.exception(e)
        finally:
            for task in pending:
                task.cancel()

        # TODO, handle restart with engine crash
        # if not self._stopping:
        #     if not self._process_ended.is_set():
        #         await self.stop()
        #     await self.start()

    async def _read_stderr(self):
        assert self._process is not None
        assert self._process.stderr is not None
        while True:
            line = await self._process.stderr.readline()
            if not line:
                break
            sys.stderr.write(f"> { line.decode('utf-8') }")

    def _send_results(self, results: AnalysisResponse, complete: bool):
        # send the results to the analysis
        if (
            self._analysis is not None
            and results.instanceId == self.current_request.instanceId
            and results.analysisId == self.current_request.analysisId
            and results.revision == self.current_request.revision
        ):
            if not complete:
                if not self._analysis.results.done():
                    self._analysis.results.write(results)
            else:
                if not self._analysis.results.done():
                    self._analysis.results.set_result(results)
                self._analysis.complete.set()
                self._analysis = None

    async def _receive_results(self) -> tuple[AnalysisResponse, bool]:
        # wait for results and return them
        assert self._process is not None
        assert self._process.stdout is not None
        try:
            payload_size_bytes = await self._process.stdout.readexactly(4)
            payload_size = int.from_bytes(payload_size_bytes, "little")
            payload = await self._process.stdout.readexactly(payload_size)

            message = ComsMessage()
            message.ParseFromString(payload)

            complete = message.status != MESSAGE_IN_PROGRESS
            results = AnalysisResponse()
            results.ParseFromString(message.payload)

            return (results, complete)
        except IncompleteReadError:
            return (None, True)

    async def _wait_ended(self):
        # wait for the engine process to finish
        assert self._process is not None
        process_ended = create_task(self._process.wait())
        process_abandoned = create_task(self._process_ended.wait())
        done, pending = await wait(
            {process_ended, process_abandoned}, return_when=FIRST_COMPLETED
        )
        if process_ended in done:
            self._process_ended.set()
        for task in pending:
            task.cancel()

    async def stop(self):
        """stop the engine process"""

        if self._stopping:
            await self._process_ended.wait()
            return

        assert self._process is not None

        logger.debug("stopping engine")

        # flag indicating intentional stop
        self._stopping = True

        logger.debug("Terminating engine")

        try:
            try:
                self._process.terminate()
            except ProcessLookupError:
                pass  # already terminated
            except Exception as e:
                logger.exception(e)

            try:
                await wait_for(self._process_ended.wait(), 1)
            except TimeoutError:
                pass
            else:
                logger.debug("Terminated engine")
                return

            # kill the engine process
            logger.debug("Killing engine")

            try:
                self._process.kill()
            except ProcessLookupError:
                pass  # already terminated
            except Exception as e:
                logger.exception(e)

            # abandon
            self._process_ended.set()
        finally:
            self._stopping = False
