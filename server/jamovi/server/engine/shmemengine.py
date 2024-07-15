

import os
import os.path as path
import platform

import threading
import subprocess
from enum import Enum

import nanomsg

import logging
from asyncio import get_event_loop
from asyncio import Queue
from asyncio import ensure_future as create_task
from asyncio import CancelledError
from asyncio import wait
from asyncio import wait_for
from asyncio import TimeoutError
from asyncio import sleep
from asyncio import create_subprocess_exec
from asyncio import Event
from asyncio import FIRST_COMPLETED
from asyncio import current_task

from jamovi.server.jamovi_pb2 import ComsMessage
from jamovi.server.jamovi_pb2 import AnalysisStatus
from jamovi.server.jamovi_pb2 import AnalysisRequest
from jamovi.server.jamovi_pb2 import AnalysisResponse
from jamovi.server.jamovi_pb2 import Status as MessageStatus

from jamovi.server.utils import req_str
from jamovi.server.i18n import _


MESSAGE_COMPLETE = MessageStatus.Value('COMPLETE')
MESSAGE_ERROR = MessageStatus.Value('ERROR')
MESSAGE_IN_PROGRESS = MessageStatus.Value('IN_PROGRESS')

ANALYSIS_INITED = AnalysisStatus.Value('ANALYSIS_INITED')
ANALYSIS_COMPLETE = AnalysisStatus.Value('ANALYSIS_COMPLETE')
ANALYSIS_ERROR = AnalysisStatus.Value('ANALYSIS_ERROR')

PERFORM_INIT = AnalysisRequest.Perform.Value('INIT')
PERFORM_RUN = AnalysisRequest.Perform.Value('RUN')
PERFORM_SAVE = AnalysisRequest.Perform.Value('SAVE')


log = logging.getLogger(__name__)


class ShMemEngine:

    class Status(Enum):
        WAITING = 0
        INITING = 1
        RUNNING = 2
        OPPING = 3  # performing operation

    def __init__(self, parent, data_path, conn_root, config, monitor=None):
        self._parent = parent
        self._data_path = data_path
        self._conn_root = conn_root
        self._config = config
        self._monitor = monitor

        allow_arbitrary_code = config.get('allow_arbitrary_code', 'true')
        self._allow_arbitrary_code = not (allow_arbitrary_code == 'false' or allow_arbitrary_code == '0')

        self._conn_path = None
        self._process = None
        self._process_stopping = None
        self._process_abandoned = None
        self._socket = None
        self._thread = None

        # if a crash happens at start up, well, that's bad
        self._at_startup = True

        self._message_id = 0

        self._running = Event()
        self._stopped = Event()
        self._stopped.set()

        self._current_analysis = None

        self._ioloop = get_event_loop()

        self._results_queue = Queue()

        dur_limit = self._config.get('analysis_duration_limit', None)
        if dur_limit:
            dur_limit = int(dur_limit)
        self._analysis_duration_limit = dur_limit

    async def start(self):

        self._at_startup = True
        self._process_stopping = threading.Event()
        self._process_abandoned = threading.Event()

        if self._socket is not None:
            try:
                self._socket.close()
            except Exception as e:
                log.exception(e)
            self._socket = None

        self._conn_path = f'{self._conn_root}-{self._parent._next_conn_index}'
        self._parent._next_conn_index += 1

        bin_dir = 'bin' if platform.system() != 'Darwin' else 'MacOS'
        exe_dir = path.join(self._config.get('home'), bin_dir)
        exe_path = path.join(exe_dir, 'jamovi-engine')

        env = os.environ.copy()
        env['R_HOME'] = self._config.get('r_home', env.get('R_HOME', ''))
        env['R_LIBS'] = self._config.get('r_libs', env.get('R_LIBS', ''))
        env['FONTCONFIG_PATH'] = self._config.get('fontconfig_path', env.get('FONTCONFIG_PATH', ''))
        env['JAMOVI_MODULES_PATH'] = self._config.get('modules_path', env.get('JAMOVI_MODULES_PATH', ''))
        env['PATH'] = self._config.get('path', env.get('PATH', ''))

        if platform.uname().system == 'Linux':
            # plotting under linux sometimes doesn't work without this
            env['LC_ALL'] = 'en_US.UTF-8'
            # https://github.com/jamovi/jamovi/issues/801
            # https://github.com/jamovi/jamovi/issues/831

        elif platform.uname().system == 'Windows':
            # lubridate doesn't work without this
            env['TZDIR'] = f'{ env["R_HOME"] }\\share\\zoneinfo'

        con = '--con={}'.format(self._conn_path)
        pth = '--path={}'.format(self._data_path)

        try:
            if platform.uname().system == 'Windows':
                si = subprocess.STARTUPINFO()
                # makes the engine windows visible in debug mode (on windows)
                if not self._config.get('debug', False):
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

            mem_limit = self._config.get('memory_limit_engine', None)
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

            # max size of nanomsg messages ... default was 1Mb under macOS
            self._socket.set_int_option(nanomsg.SOL_SOCKET, nanomsg.RCVMAXSIZE, 4 * 1024 * 1024)
            self._socket.bind(self._conn_path)

            # need a separate thread for nanomsg :/
            self._thread = threading.Thread(target=self._run_loop, args=(
                self._socket,
                self._process,
                self._process_stopping,
                self._process_abandoned))
            self._thread.start()

            self._stopped.clear()
            self._running.set()

        except Exception as e:
            log.exception(e)
            self._parent._notify_engine_event({
                'type': 'error',
                'message': 'Engine process could not be started',
                'cause': str(e),
            })

    async def stop(self):

        log.debug('Stopping engine (2)')

        self._message_id += 1

        request = AnalysisRequest()
        request.restartEngines = True

        message = ComsMessage()
        message.id = self._message_id
        message.payload = request.SerializeToString()
        message.payloadType = 'AnalysisRequest'

        self._process_stopping.set()

        # send a message to end the engine
        self._socket.send(message.SerializeToString())

        try:
            await wait_for(self._stopped.wait(), 1)
        except TimeoutError:
            pass
        else:
            log.debug('Engine stopped')
            return

        log.debug('Terminating engine')
        try:
            self._process.terminate()
        except ProcessLookupError:
            pass  # already terminated
        except Exception as e:
            log.exception(e)

        try:
            await wait_for(self._stopped.wait(), 1)
        except TimeoutError:
            pass
        else:
            log.debug('Terminated engine')
            return

        # kill and abandon the engine process
        log.debug('Killing engine')

        try:
            log.debug('Trying socket close')
            self._socket.close()
            log.debug('Socket closed')
        except Exception as e:
            log.debug('Socket close failed')
            log.exception(e)

        self._process_abandoned.set()
        try:
            self._process.kill()
        except ProcessLookupError:
            pass  # already terminated
        except Exception as e:
            log.exception(e)

        # in the end, if we still can't kill the process
        # then we've got to move on
        self._notify_process_ended()
        log.debug('Abandoned the engine process')

    async def run(self, request, results_stream):

        if request.arbitraryCode and not self._allow_arbitrary_code:
            error = self._create_error_response(
                request,
                _('Analyses which execute arbitrary code are not permitted in this session.'))
            results_stream.set_result(error)
            return

        if self._current_analysis is not None and not self._current_analysis.done():
            self._current_analysis.cancel()

        self._current_analysis = current_task()

        await self._running.wait()

        request.restartEngines = False  # unset in case of malicious actor

        message = ComsMessage()
        message.id = self._message_id
        message.payload = request.SerializeToString()
        message.payloadType = 'AnalysisRequest'

        self._socket.send(message.SerializeToString())
        self._message_id += 1

        # now we've sent a request, if the engine crashes, we'll
        # attribute it to the analysis
        self._at_startup = False

        results_received = create_task(self._results_queue.get())
        engine_stopped = create_task(self._stopped.wait())

        pending = { results_received, engine_stopped, results_stream }

        timeout = None
        if self._analysis_duration_limit is not None:
            timeout = create_task(sleep(self._analysis_duration_limit))
            pending.add(timeout)

        try:
            complete = False

            while not complete:
                done, pending = await wait(pending, return_when=FIRST_COMPLETED)

                if results_received in done:

                    results, complete = results_received.result()

                    if (request.instanceId == results.instanceId
                            and request.analysisId == results.analysisId
                            and request.revision == results.revision):

                        if complete:
                            results_stream.set_result(results)
                        else:
                            results_stream.write(results)
                    else:
                        complete = False

                    if not complete:
                        results_received = create_task(self._results_queue.get())
                        pending.add(results_received)

                elif timeout in done:

                    log.debug('%s %s', 'timedout', req_str(request))

                    error = self._create_error_response(
                        request,
                        _('This analysis has exceeded the current time limits and has been terminated.'))
                    await self.stop()
                    results_stream.set_result(error)
                    await self.restart()
                    break

                elif engine_stopped in done:

                    log.debug('%s %s', 'crashed', req_str(request))

                    error = self._create_error_response(
                        request,
                        _('This analysis has terminated, likely due to hitting a resource limit.'))
                    results_stream.set_result(error)
                    await self.restart()
                    break

                elif results_stream in done:
                    break

        except CancelledError:
            raise
        except Exception as e:
            log.exception(e)
        finally:
            results_received.cancel()
            engine_stopped.cancel()
            if timeout is not None:
                timeout.cancel()

    async def restart(self):
        if self._running.is_set():
            log.info('Stopping engine')
            await self.stop()
        log.info('Restarting engine')
        await self.start()

    def _notify_process_ended(self):
        self._running.clear()
        self._stopped.set()

    def _run_loop(self, socket, process, stopping_flag, abandoned_flag):
        parent = threading.main_thread()

        try:
            while parent.is_alive():
                try:
                    bytes = socket.recv()

                    message = ComsMessage()
                    message.ParseFromString(bytes)
                    complete = (message.status != MESSAGE_IN_PROGRESS)

                    results = AnalysisResponse()
                    results.ParseFromString(message.payload)

                    self._ioloop.call_soon_threadsafe(self._results_queue.put_nowait, (results, complete))

                except nanomsg.NanoMsgAPIError as e:
                    if e.errno != nanomsg.ETIMEDOUT and e.errno != nanomsg.EAGAIN:
                        raise e

                if abandoned_flag.is_set():
                    break
                if isinstance(process, subprocess.Popen):
                    process.poll()
                if process.returncode is not None:
                    break
        except nanomsg.NanoMsgAPIError as e:
            # we expect this exception if the process is stopping
            if not stopping_flag.is_set():
                raise e
        finally:
            self._ioloop.call_soon_threadsafe(self._on_terminated, process.returncode, stopping_flag, abandoned_flag)
            socket.close()

    def _on_terminated(self, return_code, stopping_flag, abandoned_flag):
        if abandoned_flag.is_set():
            return
        self._notify_process_ended()
        if self._current_analysis is None or self._current_analysis.done():
            if not stopping_flag.is_set():
                # spontaneous crash ... not caused by an analysis
                log.error('Engine crash (spontaneous) with exit code {}\n'.format(return_code))
                if self._at_startup:
                    # if the engine crashes at start up, we're in trouble
                    # this probably means the service isn't viable
                    self._parent._notify_engine_event({
                        'type': 'error',
                        'message': 'Engine process terminated',
                        'cause': 'Exit code: {}'.format(return_code),
                    })
                else:
                    # crash while analysis not running
                    # unusual, but recoverable -- perform a restart
                    create_task(self.restart())
            else:
                # intentional stop
                pass
        else:
            # termination while analysis running
            # restarting is handled elsewhere
            pass

    def _create_error_response(self, request, message):
        results = AnalysisResponse()
        results.instanceId = request.instanceId
        results.analysisId = request.analysisId
        results.name = request.name
        results.ns = request.ns
        results.options.CopyFrom(request.options)
        results.status = ANALYSIS_ERROR
        results.revision = request.revision
        results.version = 0

        results.results.name = request.name
        results.results.title = request.name
        results.results.status = ANALYSIS_ERROR
        results.results.error.message = message

        item = results.results.group.elements.add()
        item.preformatted = ''

        return results

    def __del__(self):
        if self._process is not None:
            self._process.terminate()
