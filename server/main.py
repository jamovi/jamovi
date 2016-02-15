import sys, os

tld = os.path.realpath(os.path.join(os.path.dirname(__file__), '../..'))
sys.path.append(os.path.join(tld, 'lib/python3.5/site-packages'))
sys.path.append(os.path.join(tld, 'lib/python3.5/lib-dynload'))
os.environ['PATH'] = os.path.join(tld, 'lib') + ';' + os.environ['PATH']

from server import Server

from silky import Dirs
from fasteners.process_lock import InterProcessLock as Lock
import glob
import subprocess
import time

global shutdown_on_idle
global launch_client

class Unbuffered(object):
   def __init__(self, stream):
       self.stream = stream
   def write(self, data):
       self.stream.write(data)
       self.stream.flush()
   def __getattr__(self, attr):
       return getattr(self.stream, attr)

def _port_opened(port_no):

    print('Server listening on port: ' + str(port_no))

    port_lock_path = Dirs.appDataDir() + '/' + str(port_no) + '.lock'
    with open(port_lock_path, 'a'):
        pass

    if launch_client:
        _launch_electron(port_no)

def _launch_electron(port_no):

    if os.name == 'nt':
        exe = os.path.join(tld, 'node_modules/electron-prebuilt/dist/electron.exe')
    else:
        exe = os.path.join(tld, 'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron')

    main = os.path.join(tld, 'silky/electron/main.js')
    subprocess.Popen([exe, main, str(port_no)], close_fds=True)

if __name__ == "__main__":

    global shutdown_on_idle
    global launch_client

    shutdown_on_idle = False
    launch_client = False
    debug = False

    sys.stdout = Unbuffered(sys.stdout)
    sys.stderr = Unbuffered(sys.stderr)

    port = 0
    if len(sys.argv) > 1:
        port = sys.argv[1]

    for i in range(2, len(sys.argv)):
        if sys.argv[i] == '--shutdown_on_idle':
            shutdown_on_idle = True
        if sys.argv[i] == '--launch_client':
            launch_client = True
        if sys.argv[i] == '--debug':
            debug = True

    app_data_path = Dirs.appDataDir()
    lock_path = Dirs.appDataDir() + '/lock'
    lock = Lock(lock_path)

    if lock.acquire(blocking=False):

        left_over_lock_files = glob.glob(app_data_path + '/*.lock')
        for left_over in left_over_lock_files:
            os.remove(left_over)

        server = Server(port, shutdown_on_idle=shutdown_on_idle, debug=debug)
        server.add_port_opened_listener(_port_opened)
        server.start()
    else:
        print('Server already running')
        server_found = False
        while server_found is False:
            lock_files = glob.glob(app_data_path + '/*.lock')
            for file in lock_files:
                try:
                    port_no = int(os.path.splitext(os.path.basename(file))[0])
                    _launch_electron(port_no)
                    server_found = True
                    break
                except:
                    pass
            time.sleep(.2)

    
