
import sys
import os
import os.path as path

from threading import Thread, main_thread
from subprocess import Popen

from nanomsg import Socket, PAIR

import enginecoms
import json


class EngineManager:

    def __init__(self):
        self._thread = None
        self._socket = None
        self._address = "ipc://silky{}".format(os.getpid())
        self._process = None
        self._scheduledAnalyses = [ ]
        self._runningAnalyses = [ ]

    def __del__(self):
        if self._process is not None:
            self._process.terminate()

    def start(self):
        self._thread = Thread(target=self._run)
        self._thread.start()

    def scheduleAnalysis(self, analysis):
        request = enginecoms.Request()
        request.id = 1
        request.analysis.id = analysis.id
        request.analysis.name = analysis.name
        request.analysis.ns = analysis.ns
        request.analysis.perform = enginecoms.AnalysisRequest.Perform.RUN
        request.analysis.options = json.dumps(analysis.options)

        self._socket.send(request.encode_to_bytes())

    @property
    def address(self):
        return self._address

    def _run(self):
        root = path.realpath(path.join(path.dirname(__file__), '../../..'))
        exe_path = path.join(root, 'bin/engine')

        if os.name == 'nt':
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

        self._socket = Socket(PAIR)
        self._socket._set_recv_timeout(500)

        if os.name == 'nt':  # windows
            self._socket.bind(self._address.encode('utf-8'))  # weird
        else:
            self._socket.bind(self._address)

        parent = main_thread()
        while parent.is_alive():
            try:
                message = self._socket.recv()
                print(message)
            except:
                pass

            self._process.poll()
            if self._process.returncode is not None:
                sys.stderr.write("Engine process terminated with exit code {}\n".format(self._process.returncode))
                break

        self._socket.close()
