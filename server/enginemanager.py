
import sys
import os
import os.path as path
import platform

import threading
import tempfile
import subprocess

import nanomsg

from . import silkycoms_pb2 as silkycoms

import logging

log = logging.getLogger('silky')


class EngineManager:

    def __init__(self):
        self._thread = None
        self._socket = None

        if platform.uname().system == 'Windows':
            self._address = "ipc://{}".format(os.getpid())
        else:
            self._dir = tempfile.TemporaryDirectory()
            self._address = "ipc://{}/connection".format(self._dir.name)

        self._process = None
        self._requests_sent = { }
        self._nextId = 1
        self._results_listeners = [ ]
        self._session_path = None

    def __del__(self):
        if self._process is not None:
            self._process.terminate()

    def start(self, session_path):
        self._session_path = session_path

        root = path.realpath(path.join(path.dirname(__file__), '../../..'))
        exe_path = path.join(root, 'bin/engine')

        if platform.uname().system == 'Windows':
            r_home = path.join(root, 'Frameworks', 'R')
            paths = [
                path.join(root, 'Resources', 'lib'),
                path.join(r_home, 'bin', 'x64'),
                path.join(r_home, 'library', 'RInside', 'lib', 'x64'),
            ]
            all_paths = ';'.join(paths)
        else:
            all_paths = ''

        env = os.environ
        env['PATH'] = all_paths

        con = '--con={}'.format(self._address)
        pth = '--path={}'.format(self._session_path)

        si = None
        if platform.uname().system == 'Windows':
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        self._process = subprocess.Popen([exe_path, con, pth], env=env, startupinfo=si)

        self._socket = nanomsg.Socket(nanomsg.PAIR)
        self._socket._set_recv_timeout(500)

        if platform.uname().system == 'Windows':
            self._socket.bind(self._address.encode('utf-8'))
        else:
            self._socket.bind(self._address)

        self._thread = threading.Thread(target=self._run)
        self._thread.start()

    def send(self, request):

        message = silkycoms.ComsMessage()
        message.id = self._nextId
        message.payload = request.SerializeToString()
        message.payloadType = "AnalysisRequest"

        self._requests_sent[message.id] = request

        self._nextId += 1

        self._socket.send(message.SerializeToString())

    def _receive(self, message):

        if message.id in self._requests_sent:
            request = self._requests_sent[message.id]
            results = silkycoms.AnalysisResponse()
            results.ParseFromString(message.payload)

            complete = False

            if results.status == silkycoms.AnalysisStatus.Value('ANALYSIS_COMPLETE'):
                complete = True
            elif results.status == silkycoms.AnalysisStatus.Value('ANALYSIS_INITED') and request.perform == silkycoms.AnalysisRequest.Perform.Value('INIT'):
                complete = True

            self._notify_results(results, request, complete)

        else:
            log.info('id : {} not found in waiting requests'.format(message.id))

    def _notify_results(self, results, request, complete):
        for listener in self._results_listeners:
            listener(results, request, complete)

    def add_results_listener(self, listener):
        self._results_listeners.append(listener)

    @property
    def address(self):
        return self._address

    def _run(self):
        parent = threading.main_thread()
        while parent.is_alive():
            try:
                bytes = self._socket.recv()
                message = silkycoms.ComsMessage()
                message.ParseFromString(bytes)
                self._receive(message)

            except nanomsg.NanoMsgAPIError as e:
                if e.errno != nanomsg.ETIMEDOUT and e.errno != nanomsg.EAGAIN:
                    raise e

            self._process.poll()
            if self._process.returncode is not None:
                sys.stderr.write("Engine process terminated with exit code {}\n".format(self._process.returncode))
                break

        self._socket.close()
