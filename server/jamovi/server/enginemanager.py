
import sys
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
from . import jamovi_pb2 as jcoms
from .analyses import Analysis

import logging
import asyncio
from asyncio import Queue

log = logging.getLogger('jamovi')


class Engine:

    class Status(Enum):
        WAITING = 0
        INITING = 1
        RUNNING = 2
        OPPING = 3  # performing operation

    def __init__(self, parent, data_path, conn_path):
        self._parent = parent
        self._data_path = data_path
        self._conn_path = conn_path

        self.analysis = None
        self.status = Engine.Status.WAITING

        self._process = None
        self._socket = None
        self._thread = None
        self._message_id = 0
        self._restarting = False
        self._stopping = False
        self._stopped = False

        self._ioloop = asyncio.get_event_loop()

    @property
    def is_waiting(self):
        return self.status is Engine.Status.WAITING

    def start(self):

        exe_dir = path.join(conf.get('home'), 'bin')
        exe_path = path.join(exe_dir, 'jamovi-engine')

        env = os.environ.copy()
        env['R_HOME'] = conf.get('r_home', env.get('R_HOME', ''))
        env['R_LIBS'] = conf.get('r_libs', env.get('R_LIBS', ''))
        env['FONTCONFIG_PATH'] = conf.get('fontconfig_path', env.get('FONTCONFIG_PATH', ''))
        env['JAMOVI_MODULES_PATH'] = conf.get('modules_path', env.get('JAMOVI_MODULES_PATH', ''))

        si = None
        stdout = sys.stdout
        stderr = sys.stderr

        # Additional customizations for windows
        if platform.uname().system == 'Windows':
            si = subprocess.STARTUPINFO()
            stdout = None
            stderr = None  # stdouts seem to break things on windows

            # makes the engine windows visible in debug mode (on windows)
            if not conf.get('debug', False):
                si.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        # be a bit wary to make changes to the Popen call
        # seemingly inconsequential changes can break things on windows

        con = '--con={}'.format(self._conn_path)
        pth = '--path={}'.format(self._data_path)

        try:
            self._process = subprocess.Popen(
                [exe_path, con, pth],
                startupinfo=si,
                stdout=stdout,
                stderr=stderr,
                env=env)

            self._socket = nanomsg.Socket(nanomsg.PAIR)
            self._socket._set_recv_timeout(500)
            self._socket.bind(self._conn_path)

            self._thread = threading.Thread(target=self._run)
            self._thread.start()

        except BaseException as e:
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

        request = jcoms.AnalysisRequest()
        request.restartEngines = True

        message = jcoms.ComsMessage()
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
                message = jcoms.ComsMessage()
                message.ParseFromString(bytes)
                self._ioloop.call_soon_threadsafe(self._receive, message)

            except nanomsg.NanoMsgAPIError as e:
                if e.errno != nanomsg.ETIMEDOUT and e.errno != nanomsg.EAGAIN:
                    raise e

            self._process.poll()
            if self._process.returncode is not None:
                break

        self._ioloop.call_soon_threadsafe(self._on_closing)

    def _on_closing(self):
        self._socket.close()
        if self._restarting:
            log.info('Restarting engine')
            self._stopping = False
            self.start()
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

    def send(self, analysis, run=True):

        self._message_id += 1
        self.analysis = analysis

        request = jcoms.AnalysisRequest()

        request.sessionId = analysis.instance.session.id
        request.instanceId = analysis.instance.id
        request.analysisId = analysis.id
        request.name = analysis.name
        request.ns = analysis.ns

        if analysis.status is Analysis.Status.COMPLETE and analysis.needs_op:

            analysis.op.waiting = False
            request.options.CopyFrom(analysis.options.as_pb())
            request.perform = jcoms.AnalysisRequest.Perform.Value('SAVE')
            request.path = analysis.op.path
            request.part = analysis.op.part
            self.status = Engine.Status.OPPING

        else:

            analysis.status = Analysis.Status.RUNNING

            request.options.CopyFrom(analysis.options.as_pb())
            request.changed.extend(analysis.changes)
            request.revision = analysis.revision
            request.clearState = analysis.clear_state

            if run:
                request.perform = jcoms.AnalysisRequest.Perform.Value('RUN')
                self.status = Engine.Status.RUNNING
            else:
                request.perform = jcoms.AnalysisRequest.Perform.Value('INIT')
                self.status = Engine.Status.INITING

        message = jcoms.ComsMessage()
        message.id = self._message_id
        message.payload = request.SerializeToString()
        message.payloadType = 'AnalysisRequest'

        self._socket.send(message.SerializeToString())

    def _receive(self, message):

        if self.status is Engine.Status.WAITING:
            log.info('id : {}, response received when not running'.format(message.id))
        elif self.status is Engine.Status.OPPING:
            self.status = Engine.Status.WAITING
            if message.status == jcoms.Status.Value('ERROR'):
                self.analysis.op.set_exception(RuntimeError(message.error.cause))
            else:
                self.analysis.op.set_result(message)
            self.analysis = None
            self._parent._send_next()
        else:
            results = jcoms.AnalysisResponse()
            results.ParseFromString(message.payload)

            if results.revision == self.analysis.revision:
                complete = False
                if results.incAsText and results.status == jcoms.AnalysisStatus.Value('ANALYSIS_COMPLETE'):
                    complete = True
                elif results.incAsText and results.status == jcoms.AnalysisStatus.Value('ANALYSIS_ERROR'):
                    complete = True
                elif self.status == Engine.Status.INITING and results.status == jcoms.AnalysisStatus.Value('ANALYSIS_INITED'):
                    complete = True

                self.analysis.set_results(results)

                if complete:
                    self.status = Engine.Status.WAITING
                    self.analysis = None
                    self._parent._send_next()


class EngineManager:

    def __init__(self, data_path, analyses):

        self._data_path = data_path
        self._analyses = analyses
        self._analyses.add_options_changed_listener(self._send_next)

        if platform.uname().system == 'Windows':
            self._conn_root = "ipc://{}".format(str(uuid4()))
        else:
            self._dir = tempfile.TemporaryDirectory()  # assigned to self so it doesn't get cleaned up
            self._conn_root = "ipc://{}/conn".format(self._dir.name)

        self._engine_listeners  = [ ]

        self._engines = [ ]
        for index in range(3):
            conn_path = '{}-{}'.format(self._conn_root, index)
            engine = Engine(
                parent=self,
                data_path=data_path,
                conn_path=conn_path)
            self._engines.append(engine)

        self._restart_task = Queue()

    def start(self):
        for index in range(len(self._engines)):
            self._engines[index].start()

    def stop(self):
        for index in range(len(self._engines)):
            self._engines[index].stop()

    async def restart_engines(self):
        for engine in self._engines:
            engine.restart()
            self._restart_task.put_nowait(engine)
        await self._restart_task.join()

    def _notify_engine_restarted(self, engine):
        self._restart_task.task_done()

    def add_engine_listener(self, listener):
        self._engine_listeners.append(listener)

    def _notify_engine_event(self, event):
        for listener in self._engine_listeners:
            listener(event)

    def _send_next(self, analysis=None):
        if analysis is not None:
            for engine in self._engines:
                if analysis is engine.analysis:
                    engine.send(analysis)
        for engine in self._engines:
            if engine.is_waiting:
                for analysis in self._analyses.needs_init:
                    engine.send(analysis, False)
                    break
            if engine.is_waiting:
                for analysis in self._analyses.needs_op:
                    engine.send(analysis, True)
                    break
            if engine.is_waiting:
                for analysis in self._analyses.needs_run:
                    engine.send(analysis, True)
                    break
