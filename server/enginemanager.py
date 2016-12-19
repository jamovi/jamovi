
import sys
import os.path as path
import platform

import threading
import tempfile
import subprocess
from enum import Enum

import nanomsg

from .utils import conf
from . import jamovi_pb2 as jcoms
from .analyses import Analysis

import logging

log = logging.getLogger('jamovi')


class Engine:

    class Status(Enum):
        WAITING = 0
        INITING = 1
        RUNNING = 2

    def __init__(self, parent, instance_id, index, session_path, conn_root):
        self._parent = parent
        self._instance_id = instance_id
        self._index = index
        self._session_path = session_path
        self._conn_root = conn_root

        self.analysis = None
        self.status = Engine.Status.WAITING

        self._process = None
        self._socket = None
        self._thread = None
        self._message_id = 0
        self._restarting = False
        self._stopping = False
        self._stopped = False

    @property
    def is_waiting(self):
        return self.status is Engine.Status.WAITING

    def start(self):

        exe_dir = path.join(conf.get('home'), 'bin')
        exe_path = path.join(exe_dir, 'jamovi-engine')

        si = None
        stdout = sys.stdout
        stderr = sys.stderr
        if platform.uname().system == 'Windows':
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            stdout = None
            stderr = None  # stdouts seem to break things

        # be a bit wary of changes to the Popen call
        # seemingly inconsequential changes can break things on windows

        address = self._conn_root + '-' + str(self._index)
        con = '--con={}'.format(address)
        pth = '--path={}'.format(self._session_path)
        self._process = subprocess.Popen(
            [exe_path, con, pth],
            startupinfo=si,
            stdout=stdout,
            stderr=stderr)

        self._socket = nanomsg.Socket(nanomsg.PAIR)
        self._socket._set_recv_timeout(500)
        self._socket.bind(address)

        self._thread = threading.Thread(target=self._run)
        self._thread.start()

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
                self._receive(message)

            except nanomsg.NanoMsgAPIError as e:
                if e.errno != nanomsg.ETIMEDOUT and e.errno != nanomsg.EAGAIN:
                    raise e

            self._process.poll()
            if self._process.returncode is not None:
                if self._restarting is False and self._stopping is False:
                    log.error('Engine process terminated with exit code {}\n'.format(self._process.returncode))
                break

        self._socket.close()
        if self._restarting:
            log.info('Restarting engine')
            self._restarting = False
            self._stopping = False
            self.start()
        else:
            self._stopped = True
            self._parent._notify_engine_event({ 'type': 'terminated' })

    def __del__(self):
        if self._process is not None:
            self._process.terminate()

    def send(self, analysis, run=True):

        self._message_id += 1
        self.analysis = analysis
        analysis.status = Analysis.Status.RUNNING

        request = jcoms.AnalysisRequest()
        request.datasetId = self._instance_id
        request.analysisId = analysis.id
        request.name = analysis.name
        request.ns = analysis.ns
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
        else:
            results = jcoms.AnalysisResponse()
            results.ParseFromString(message.payload)

            if results.revision == self.analysis.revision:
                complete = False
                if results.incAsText and results.status == jcoms.AnalysisStatus.Value('ANALYSIS_COMPLETE'):
                    complete = True
                elif self.status == Engine.Status.INITING and results.status == jcoms.AnalysisStatus.Value('ANALYSIS_INITED'):
                    complete = True

                self.analysis.set_results(results)

                if complete:
                    self.status = Engine.Status.WAITING
                    self.analysis = None
                    self._parent._send_next()


class EngineManager:

    def __init__(self, instance_id, analyses, session_path):

        self._instance_id = instance_id
        self._analyses = analyses
        self._analyses.add_options_changed_listener(self._send_next)

        if platform.uname().system == 'Windows':
            self._conn_root = "ipc://{}".format(instance_id)
        else:
            self._dir = tempfile.TemporaryDirectory()  # assigned to self so it doesn't get cleaned up
            self._conn_root = "ipc://{}/conn".format(self._dir.name)

        self._engine_listeners  = [ ]

        self._engines = [ ]
        for index in range(3):
            engine = Engine(
                parent=self,
                instance_id=instance_id,
                index=index,
                session_path=session_path,
                conn_root=self._conn_root)
            self._engines.append(engine)

    def start(self):
        for index in range(len(self._engines)):
            self._engines[index].start()

    def stop(self):
        for index in range(len(self._engines)):
            self._engines[index].stop()

    def restart_engines(self):
        self._engines_restarted = 0
        for index in range(len(self._engines)):
            self._engines[index].restart()

    def _notify_engine_restarted(self, engine):
        self._engines_restarted += 1
        if self._engines_restarted == len(self._engines):
            for analysis in self._analyses:
                analysis.rerun()

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
                for analysis in self._analyses.need_init:
                    engine.send(analysis, False)
                    break
            if engine.is_waiting:
                for analysis in self._analyses.need_run:
                    engine.send(analysis, True)
                    break
