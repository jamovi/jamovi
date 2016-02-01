
from threading import Thread, current_thread, main_thread
from subprocess import Popen
from time import sleep
import os
import os.path as path

from nanomsg import Socket, PAIR

class EngineManager:

    def __init__(self):
        self._thread = None
        self._socket = None
        self._address = "ipc://silky{}".format(os.getpid())
        self._ep = None
    
    def __del__(self):
        if self._ep is not None:
            self._ep.terminate()
    
    def start(self):
        self._thread = Thread(target=self._run)
        self._thread.start()
    
    @property
    def address(self):
        return self._address
    
    def _run(self):
        exe_path = path.join(path.realpath(path.dirname(__file__)), '..', 'build-engine-Desktop_Qt_5_5_1_clang_64bit-Debug', 'engine')
        args = '--con={}'.format(self._address)
        self._ep = Popen([exe_path, args])

        self._socket = Socket(PAIR)
        self._socket._set_recv_timeout(500)
        self._socket.bind(self._address)
        
        parent = main_thread()
        while parent.is_alive():
            try:
                message = self._socket.recv()
                print(message)
            except:
                pass
    