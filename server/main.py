
import sys
import os

tld = os.path.realpath(os.path.join(os.path.dirname(__file__), '../..'))
sys.path.append(os.path.join(tld, 'lib', 'python3.5', 'site-packages'))
sys.path.append(os.path.join(tld, 'lib', 'python3.5', 'lib-dynload'))
os.environ['PATH'] = os.path.join(tld, 'lib') + ';' + os.environ['PATH']

from server import Server
from clientconnection import ClientConnection

from silky import Dirs
from fasteners.process_lock import InterProcessLock as Lock

import glob
import subprocess
import threading
import time
import logging

log = logging.getLogger('silky')
if not sys.executable.endswith('pythonw.exe'):
    log.setLevel(logging.INFO)
    log.addHandler(logging.StreamHandler(sys.stdout))

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


def _ports_opened(ports):

    log.info('Server listening on ports: ' + str(ports[0]) + ', ' + str(ports[1]) + ', ' + str(ports[2]))

    port_lock_path = Dirs.app_data_dir() + '/' + str(ports[0]) + ',' + str(ports[1]) + ',' + str(ports[2]) + '.lock'
    with open(port_lock_path, 'a'):
        pass

    if launch_client:
        _launch_electron('', ports)


def _launch_electron(instance_id, ports):
    ClientConnection.number_of_connections += 1
    threading.Thread(target=_launch_electron_thread, args=(instance_id, ports)).start()


def _launch_electron_thread(instance_id, ports):

    if os.name == 'nt':
        exe = os.path.join(tld, 'node_modules/electron/dist/electron.exe')
    elif os.uname()[0] == "Linux":
        exe = os.path.join(tld, 'node_modules/electron-prebuilt/dist/electron')
    else:
        exe = os.path.join(tld, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')

    main = os.path.join(tld, 'silky/electron/main.js')

    process = subprocess.Popen([exe, main, instance_id, str(ports[0]), str(ports[1]), str(ports[2])], close_fds=True)

    # we add to the number of connections to prevent the server shutting down
    # before the client has first connected (if the start up is particularly slow)

    process.wait()
    ClientConnection.number_of_connections -= 1


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
        try:
            port = int(sys.argv[1])
        except:
            pass

    for i in range(2, len(sys.argv)):
        if sys.argv[i] == '--shutdown_on_idle':
            shutdown_on_idle = True
        if sys.argv[i] == '--launch_client':
            launch_client = True
        if sys.argv[i] == '--debug':
            debug = True

    app_data_path = Dirs.app_data_dir()
    lock_path = Dirs.app_data_dir() + '/lock'
    lock = Lock(lock_path)

    if lock.acquire(blocking=False):

        left_over_lock_files = glob.glob(app_data_path + '/*.lock')
        for left_over in left_over_lock_files:
            os.remove(left_over)

        server = Server(port, shutdown_on_idle=shutdown_on_idle, debug=debug)
        server.add_ports_opened_listener(_ports_opened)
        server.start()

    else:

        log.info('Server already running')

        if launch_client:
            server_found = False
            while server_found is False:
                lock_files = glob.glob(app_data_path + '/*.lock')
                for file in lock_files:
                    try:
                        ports = os.path.splitext(os.path.basename(file))[0]
                        ports = ports.split(',')
                        ports = tuple(map(lambda x: int(x), ports))
                        _launch_electron('', ports)
                        server_found = True
                        break
                    except Exception as e:
                        log.exception(str(e))
                time.sleep(.2)
