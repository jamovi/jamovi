
import sys
import signal

from .server import Server

import logging

log = logging.getLogger('jamovi')
if not sys.executable.endswith('pythonw.exe'):
    log.setLevel(logging.INFO)
    log.addHandler(logging.StreamHandler(sys.stdout))


def _ports_opened(ports):
    sys.stdout.write('ports: ' + str(ports[0]) + ', ' + str(ports[1]) + ', ' + str(ports[2]))
    sys.stdout.flush()


def start():
    port = 0
    debug = False
    for i in range(2, len(sys.argv)):
        if sys.argv[i] == '--debug':
            debug = True

    sys.stdout.write('jamovi\nversion: 0.0.0\ncli:     0.0.0')
    sys.stdout.flush()

    server = Server(port, debug=debug)

    signal.signal(signal.SIGTERM, server.stop)

    server.add_ports_opened_listener(_ports_opened)
    server.start()
