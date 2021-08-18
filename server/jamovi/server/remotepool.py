
from asyncio import open_unix_connection
from asyncio import wait
from asyncio import ensure_future as create_task
from asyncio import FIRST_COMPLETED
from asyncio import CancelledError
from asyncio import IncompleteReadError

from struct import unpack

from .exceptions import AnalysisServiceTerminatedException

from .jamovi_pb2 import AnalysisRequest
from .jamovi_pb2 import AnalysisResponse
from .jamovi_pb2 import AnalysisStatus
from .jamovi_pb2 import Status as MessageStatus
from .jamovi_pb2 import ComsMessage

from logging import getLogger

log = getLogger(__name__)


class RemotePool:

    def __init__(self, url, queue):
        self._url = url
        self._queue = queue
        self._reader = None
        self._writer = None
        self._message_id = 1
        self._listeners = [ ]

    async def start(self):
        (reader, writer) = await open_unix_connection(path=self._url)
        self._reader = reader
        self._writer = writer
        self._run_task = create_task(self._run())
        self._run_task.add_done_callback(lambda f: f.result())

    async def stop(self):
        self._run_task.cancel()

    async def _run(self):

        write_task = create_task(self._write_loop())
        read_task = create_task(self._read_loop())

        done, pending = await wait({ write_task, read_task }, return_when=FIRST_COMPLETED)

        for task in pending:
            task.cancel()

        try:
            for task in done:
                task.result()
        except CancelledError:
            pass
        except AnalysisServiceTerminatedException:
            self._notify_engine_event({
                'type': 'error',
                'message': 'The analysis service terminated unexpectedly, and this session must now close',
            })
        except Exception as e:
            log.exception(e)
            self._notify_engine_event({
                'type': 'error',
                'message': 'An unexpected error occurred, and this session must now close',
                'cause': str(e),
            })

    async def _write_loop(self):
        async for request, stream in self._queue.stream():
            message = ComsMessage()
            message.id = self._message_id
            message.payload = request.SerializeToString()
            message.payloadType = 'AnalysisRequest'

            self._message_id += 1

            byts = message.SerializeToString()
            size = len(byts)
            size_bytes = size.to_bytes(4, 'little')

            self._writer.write(size_bytes)
            self._writer.write(byts)
            await self._writer.drain()

    async def _read_loop(self):
        try:
            while True:
                size_bytes = await self._reader.readexactly(4)
                size = unpack('<I', size_bytes)[0]
                byts = await self._reader.readexactly(size)

                message = ComsMessage()
                message.ParseFromString(byts)
                response = AnalysisResponse()
                response.ParseFromString(message.payload)

                key = (response.instanceId, response.analysisId)
                value = self._queue.get(key)
                if value is None:
                    continue

                request, stream = value

                if request.revision != response.revision:
                    continue

                ana_complete = (response.status == AnalysisStatus.Value('ANALYSIS_COMPLETE')
                                or (response.status == AnalysisStatus.Value('ANALYSIS_ERROR')))
                if request.perform == AnalysisRequest.Perform.Value('INIT'):
                    ana_complete = ana_complete or response.status == AnalysisStatus.Value('ANALYSIS_INITED')
                complete = ana_complete and message.status == MessageStatus.Value('COMPLETE')

                if not complete:
                    stream.write(response)
                else:
                    stream.set_result(response)

        except IncompleteReadError:
            raise AnalysisServiceTerminatedException

    def add_engine_listener(self, listener):
        self._listeners.append(('engine-event', listener))

    def _notify_engine_event(self, *args):
        for listener in self._listeners:
            if listener[0] == 'engine-event':
                listener[1](*args)
