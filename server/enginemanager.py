
import sys
import os
import os.path as path

import threading
from subprocess import Popen

import nanomsg

import silkycoms


class EngineManager:

    def __init__(self):
        self._thread = None
        self._socket = None
        self._address = "ipc://silky{}".format(os.getpid())
        self._process = None
        self._requests_sent = { }
        self._nextId = 1
        self._results_listeners = [ ]

    def __del__(self):
        if self._process is not None:
            self._process.terminate()

    def start(self):
        self._thread = threading.Thread(target=self._run)
        self._thread.start()

    def send(self, request):

        request.perform = silkycoms.AnalysisRequest.Perform.RUN

        message = silkycoms.ComsMessage()
        message.id = self._nextId
        message.payload = request.encode_to_bytes()
        message.payloadType = "AnalysisRequest"

        self._requests_sent[message.id] = request

        self._nextId += 1

        self._socket.send(message.encode_to_bytes())

    def _receive(self, message):

        if message.id in self._requests_sent:
            request = self._requests_sent[message.id]
            results = silkycoms.AnalysisResponse.create_from_bytes(message.payload)

            complete = False

            if results.status == silkycoms.AnalysisStatus.ANALYSIS_COMPLETE:
                complete = True
            elif results.status == silkycoms.AnalysisStatus.ANALYSIS_INITED and request.perform == silkycoms.AnalysisRequest.Perform.INIT:
                complete = True

            self._notify_results(results, request, complete)

        else:
            print('id : {} not found in waiting requests'.format(message.id))

    def _notify_results(self, results, request, complete):
        for listener in self._results_listeners:
            listener(results, request, complete)

    def add_results_listener(self, listener):
        self._results_listeners.append(listener)

    @property
    def address(self):
        return self._address

    def _run(self):
        root = path.realpath(path.join(path.dirname(__file__), '../../..'))
        exe_path = path.join(root, 'bin/engine')

        if os.uname().sysname == 'Windows':
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

        args = '--con={}'.format(self._address)
        self._process = Popen([exe_path, args], env=env)

        self._socket = nanomsg.Socket(nanomsg.PAIR)
        self._socket._set_recv_timeout(500)

        if os.uname().sysname == 'Windows':
            self._socket.bind(self._address.encode('utf-8'))
        else:
            self._socket.bind(self._address)

        parent = threading.main_thread()
        while parent.is_alive():
            try:
                bytes = self._socket.recv()
                message = silkycoms.ComsMessage.create_from_bytes(bytes)
                self._receive(message)

            except nanomsg.NanoMsgAPIError as e:
                if e.errno != nanomsg.ETIMEDOUT and e.errno != nanomsg.EAGAIN:
                    raise e

            self._process.poll()
            if self._process.returncode is not None:
                sys.stderr.write("Engine process terminated with exit code {}\n".format(self._process.returncode))
                break

        self._socket.close()
