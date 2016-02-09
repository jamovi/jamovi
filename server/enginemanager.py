
import sys
import os
import os.path as path

from threading import Thread, current_thread, main_thread
from subprocess import Popen
from time import sleep

from nanomsg import Socket, PAIR

class EngineManager:

    def __init__(self):
        self._thread = None
        self._socket = None
        self._address = "ipc://silky{}".format(os.getpid())
        self._process = None
    
    def __del__(self):
        if self._process is not None:
            self._process.terminate()
    
    def start(self):
        self._thread = Thread(target=self._run)
        self._thread.start()
    
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
            r_home = path.join(root, 'Frameworks/R.framework/Versions/3.2/Resources')
            all_paths = ''
        
        env = os.environ
        env['R_HOME'] = r_home
        env['PATH'] = all_paths;
            
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
    