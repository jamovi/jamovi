
import sys
import signal
from http.client import HTTPConnection

from .server import Server
from .utils import conf

import logging
import webbrowser
import platform


log = logging.getLogger('jamovi')
if not sys.executable.endswith('pythonw.exe'):
    formatter = logging.Formatter('%(name)s - %(message)s')
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    log.addHandler(handler)
    log.setLevel(logging.INFO)


mem_limit = conf.get('memory_limit_session', None)
if mem_limit:
    if platform.uname().system == 'Linux':
        import resource
        try:
            limit = int(mem_limit) * 1024 * 1024  # Mb
            resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        except ValueError:
            raise ValueError('memory_limit_session: bad value')
        log.info('Applying session memory limit %s Mb', mem_limit)
    else:
        raise ValueError('memory_limit_session is unavailable on systems other than linux')

# import os.path
# logpath = os.path.expanduser('~/jamovi-log.txt')
# handler = logging.FileHandler(logpath)
# log.addHandler(logpath)

start_wb = False  # start web browser


def _ports_opened(ports):

    global start_wb

    sys.stdout.write('ports: ' + str(ports[0]) + ', ' + str(ports[1]) + ', ' + str(ports[2]) + '\n')
    sys.stdout.flush()

    if start_wb:
        print('starting web browser')
        webbrowser.open('http://localhost:' + str(ports[0]))


def start():  # run down below()

    global start_wb

    try:
        port = int(sys.argv[1])
    except Exception:
        port = 1337

    debug = '--debug' in sys.argv
    slave = '--slave' in sys.argv
    stdin_slave = '--stdin-slave' in sys.argv
    start_wb = '--start-wb' in sys.argv
    session_id = None

    conf.set('devel', '--devel' in sys.argv)
    conf.set('debug', '--debug' in sys.argv)

    if '--if=*' in sys.argv:
        host = ''
    else:
        host = '127.0.0.1'

    for arg in sys.argv:
        if arg.startswith('--task-queue-url='):
            task_queue_url = arg.split('=')[1]
            conf.set('task-queue-url', task_queue_url)
        elif arg.startswith('--spool='):
            spool_dir = arg.split('=')[1]
            conf.set('spool-dir', spool_dir)
        elif arg.startswith('--session-id='):
            session_id = arg.split('=')[1]

    sys.stdout.write('jamovi\nversion: 0.0.0\ncli:     0.0.0\n')
    sys.stdout.flush()

    already_running = False

    if port != 0:
        # check to see if already running
        try:
            conn = HTTPConnection('127.0.0.1', port, .2)
            conn.request('GET', '/version')
            res = conn.getresponse()
            already_running = (res.status == 200)
        except Exception:
            already_running = False

    if not already_running:
        server = Server(
            port,
            host=host,
            session_id=session_id,
            slave=slave,
            stdin_slave=stdin_slave,
            debug=debug)

        signal.signal(signal.SIGTERM, server.stop)

        server.add_ports_opened_listener(_ports_opened)
        server.start()
    else:
        sys.stdout.write('server already running\n')
        _ports_opened([port, port + 1, port + 2])


if __name__ == '__main__':
    start()
