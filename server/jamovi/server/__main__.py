
import sys
import signal
from http.client import HTTPConnection
from asyncio import get_event_loop

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

async def main():  # run down below()

    try:
        port = int(sys.argv[1])
    except Exception:
        port = 1337

    session_id = conf.get('session_id', None)

    debug = '--debug' in sys.argv
    stdin_slave = '--stdin-slave' in sys.argv
    start_wb = '--start-wb' in sys.argv

    conf.set('devel', '--devel' in sys.argv)
    conf.set('debug', '--debug' in sys.argv)

    if '--if=*' in sys.argv:
        host = ''
    else:
        host = '127.0.0.1'

    for arg in sys.argv:
        if arg.startswith('--task-queue-url='):
            task_queue_url = arg.split('=')[1]
            conf.set('task_queue_url', task_queue_url)
        elif arg.startswith('--spool='):
            spool_path = arg.split('=')[1]
            conf.set('spool_path', spool_path)
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
            stdin_slave=stdin_slave,
            debug=debug)

        server.start()
        signal.signal(signal.SIGTERM, lambda _, __: server.stop())

        ports = await server.ports_opened
    else:
        sys.stdout.write('server already running\n')
        ports = (port, port + 1, port + 2)

    sys.stdout.write(f'ports: { ports[0] }, { ports[1] }, { ports[2] }, access_key: { ports[3] }\n')
    sys.stdout.flush()

    if start_wb:
        print('starting web browser')
        webbrowser.open('http://127.0.0.1:' + str(ports[0]))

    if not already_running:
        await server.wait_ended()


if __name__ == '__main__':
    loop = get_event_loop()
    loop.run_until_complete(main())
