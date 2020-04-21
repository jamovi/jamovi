
import os
import os.path as path
import platform

import threading
import tempfile
import subprocess
from enum import Enum
from uuid import uuid4

import nanomsg

from .utils import conf

from .jamovi_pb2 import ComsMessage
from .jamovi_pb2 import AnalysisStatus
from .jamovi_pb2 import AnalysisRequest
from .jamovi_pb2 import AnalysisResponse

from .utils import req_str

import logging
from asyncio import get_event_loop
from asyncio import Queue as AsyncQueue
from asyncio import QueueFull
from asyncio import ensure_future as create_task
from asyncio import CancelledError
from asyncio import wait
from asyncio import create_subprocess_exec


log = logging.getLogger(__name__)


class EngineManager:

    def __init__(self, data_path, queue, monitor=None):

        self._data_path = data_path
        self._queue = queue
        self._monitor = monitor

        self._requests = [ None ] * queue.qsize
        self._engines = [ None ] * queue.qsize

        self._message_id = 1
        self._listeners = [ ]

        if platform.uname().system == 'Windows':
            self._conn_root = "ipc://{}".format(str(uuid4()))
        else:
            self._dir = tempfile.TemporaryDirectory()  # assigned to self so it doesn't get cleaned up
            self._conn_root = "ipc://{}/conn".format(self._dir.name)

        for index in range(queue.qsize):
            conn_path = '{}-{}'.format(self._conn_root, index)
            engine = Engine(
                parent=self,
                data_path=data_path,
                conn_path=conn_path,
                monitor=self._monitor)
            self._engines[index] = engine

        self._run_loop_task = create_task(self._run_loop())

        self._restart_task = AsyncQueue()

        mem_limit = conf.get('memory_limit_engine', None)
        if mem_limit and platform.uname().system == 'Linux':
            log.info('Applying engine memory limit %s Mb', mem_limit)

    async def _run_loop(self):
        try:
            tasks = set()
            async for analysis in self._queue.stream():
                task = create_task(self._run_analysis(analysis))
                tasks = set(filter(lambda t: not t.done(), tasks))
                tasks.add(task)
            for task in tasks:
                task.cancel()
        except Exception as e:
            log.exception(e)

    async def _run_analysis(self, analysis):
        request, stream = analysis

        for index, value in enumerate(self._requests):
            if value is not None:
                ex_request, ex_stream = value
                if (request.instanceId == ex_request.instanceId
                        and request.analysisId == ex_request.analysisId):
                    break
        else:
            for index, value in enumerate(self._requests):
                if value is None:
                    break
            else:
                raise QueueFull()

        try:
            log.debug('%s %s on %s', 'running', req_str(request), index)
            self._requests[index] = (request, stream)
            await self._restart_task.join()  # wait if engines are restarting
            await self._engines[index].run(request, stream)
            self._requests[index] = None
            log.debug('%s %s', 'completed', req_str(request))
        except CancelledError:
            log.debug('%s %s', 'cancelled', req_str(request))
        except Exception as e:
            log.exception(e)

    async def start(self):
        await wait(map(lambda e: e.start(), self._engines))

    def stop(self):
        for engine in self._engines:
            engine.stop()

    async def restart_engines(self):
        for engine in self._engines:
            engine.restart()
            self._restart_task.put_nowait(engine)
        await self._restart_task.join()

    def _notify_engine_restarted(self, engine):
        self._restart_task.task_done()

    def add_engine_listener(self, listener):
        self._listeners.append(('engine-event', listener))

    def _notify_engine_event(self, *args):
        for listener in self._listeners:
            if listener[0] == 'engine-event':
                listener[1](*args)


class Engine:

    class Status(Enum):
        WAITING = 0
        INITING = 1
        RUNNING = 2
        OPPING = 3  # performing operation

    def __init__(self, parent, data_path, conn_path, monitor=None):
        self._parent = parent
        self._data_path = data_path
        self._conn_path = conn_path
        self._monitor = monitor

        self._process = None
        self._socket = None
        self._thread = None
        self._message_id = 0
        self._restarting = False
        self._stopping = False
        self._stopped = False

        self._ioloop = get_event_loop()

        self._current_request = None
        self._current_results = None

    async def start(self):

        bin_dir = 'bin' if platform.system() != 'Darwin' else 'MacOS'
        exe_dir = path.join(conf.get('home'), bin_dir)
        exe_path = path.join(exe_dir, 'jamovi-engine')

        env = os.environ.copy()
        env['R_HOME'] = conf.get('r_home', env.get('R_HOME', ''))
        env['R_LIBS'] = conf.get('r_libs', env.get('R_LIBS', ''))
        env['FONTCONFIG_PATH'] = conf.get('fontconfig_path', env.get('FONTCONFIG_PATH', ''))
        env['JAMOVI_MODULES_PATH'] = conf.get('modules_path', env.get('JAMOVI_MODULES_PATH', ''))

        if platform.uname().system == 'Linux':
            # plotting under linux sometimes doesn't work without this
            env['LC_ALL'] = 'en_US.UTF-8'
            # https://github.com/jamovi/jamovi/issues/801
            # https://github.com/jamovi/jamovi/issues/831

        con = '--con={}'.format(self._conn_path)
        pth = '--path={}'.format(self._data_path)

        try:
            if platform.uname().system == 'Windows':
                si = subprocess.STARTUPINFO()
                # makes the engine windows visible in debug mode (on windows)
                if not conf.get('debug', False):
                    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW

                self._process = subprocess.Popen(
                    [ exe_path, con, pth ],
                    startupinfo=si,
                    stdout=None,  # stdouts seem to break things on windows
                    stderr=None,
                    env=env)
            else:
                # stdin=PIPE, because the engines use the closing of
                # stdin to terminate themselves.
                self._process = await create_subprocess_exec(
                    exe_path, con, pth,
                    stdout=None,
                    stderr=None,
                    stdin=subprocess.PIPE,
                    env=env)

            mem_limit = conf.get('memory_limit_engine', None)
            if mem_limit:
                if platform.uname().system == 'Linux':
                    import resource
                    try:
                        limit = int(mem_limit) * 1024 * 1024  # Mb
                        resource.prlimit(self._process.pid, resource.RLIMIT_AS, (limit, limit))
                    except ValueError:
                        raise ValueError('memory_limit_engine: bad value')
                else:
                    raise ValueError('memory_limit_engine is unavailable on systems other than linux')

            if self._monitor is not None:
                self._monitor.monitor(self._process)

            self._socket = nanomsg.Socket(nanomsg.PAIR)
            self._socket._set_recv_timeout(500)
            self._socket.bind(self._conn_path)

            # need a separate thread for nanomsg :/
            self._thread = threading.Thread(target=self._run)
            self._thread.start()

        except Exception as e:
            log.exception(e)
            self._parent._notify_engine_event({
                'type': 'error',
                'message': 'Engine process could not be started',
                'cause': str(e),
            })

    def stop(self):
        if self._stopped:
            return

        self._stopping = True
        self._message_id += 1

        request = AnalysisRequest()
        request.restartEngines = True

        message = ComsMessage()
        message.id = self._message_id
        message.payload = request.SerializeToString()
        message.payloadType = 'AnalysisRequest'

        self._socket.send(message.SerializeToString())

    def restart(self):
        self._restarting = True
        self.stop()

    def _run(self):
        parent = threading.main_thread()

        if self._restarting:
            self._parent._notify_engine_restarted(self)
            self._restarting = False

        while parent.is_alive():
            try:
                bytes = self._socket.recv()

                message = ComsMessage()
                message.ParseFromString(bytes)

                results = AnalysisResponse()
                results.ParseFromString(message.payload)

                self._ioloop.call_soon_threadsafe(self._receive, results)

            except nanomsg.NanoMsgAPIError as e:
                if e.errno != nanomsg.ETIMEDOUT and e.errno != nanomsg.EAGAIN:
                    raise e

            if isinstance(self._process, subprocess.Popen):
                self._process.poll()
            if self._process.returncode is not None:
                break

        self._ioloop.call_soon_threadsafe(self._on_closing)

    def _on_closing(self):
        self._socket.close()
        if self._restarting:
            log.info('Restarting engine')
            self._stopping = False
            create_task(self.start())
        elif self._current_request is not None:

            log.error('Engine crashed')

            request = self._current_request

            results = AnalysisResponse()
            results.instanceId = request.instanceId
            results.analysisId = request.analysisId
            results.name = request.name
            results.ns = request.ns
            results.options.CopyFrom(request.options)
            results.status = AnalysisStatus.Value('ANALYSIS_ERROR')
            results.revision = request.revision
            results.version = 0

            results.results.name = request.name
            results.results.title = request.name
            results.results.status = AnalysisStatus.Value('ANALYSIS_ERROR')
            results.results.error.message = '''
                This analysis has terminated, likely due to hitting a resource limit.
            '''

            item = results.results.group.elements.add()
            item.preformatted = ''

            self._current_results.write(results, True)

            log.info('Restarting engine')
            self._stopping = False
            create_task(self.start())
        else:
            self._stopped = True
            log.error('Engine process terminated with exit code {}\n'.format(self._process.returncode))
            self._parent._notify_engine_event({
                'type': 'error',
                'message': 'Engine process terminated',
                'cause': 'Exit code: {}'.format(self._process.returncode),
            })

    def __del__(self):
        if self._process is not None:
            self._process.terminate()

    async def run(self, request, results):

        self._current_request = request
        self._current_results = results

        request.restartEngines = False  # unset in case of malicious actor

        message = ComsMessage()
        message.id = self._message_id
        message.payload = request.SerializeToString()
        message.payloadType = 'AnalysisRequest'

        self._socket.send(message.SerializeToString())
        self._message_id += 1

        await results.completed()

        self._current_results = None
        self._current_request = None

    def _receive(self, results):

        request = self._current_request
        if request is None:
            return

        if (request.instanceId != results.instanceId
                or request.analysisId != results.analysisId
                or request.revision != results.revision):
            return

        complete = False
        if results.incAsText and results.status == AnalysisStatus.Value('ANALYSIS_COMPLETE'):
            complete = True
        elif results.incAsText and results.status == AnalysisStatus.Value('ANALYSIS_ERROR'):
            complete = True
        elif request.perform == AnalysisRequest.Perform.Value('INIT') and results.status == AnalysisStatus.Value('ANALYSIS_INITED'):
            complete = True

        self._current_results.write(results, complete)
