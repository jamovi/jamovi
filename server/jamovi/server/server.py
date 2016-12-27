
import tornado.ioloop
import tornado.netutil
import tornado.httpserver

from tornado.web import RequestHandler
from tornado.web import StaticFileHandler

from .clientconnection import ClientConnection
from .instance import Instance
from .modules import Modules
from .utils import conf

import sys
import os.path
import uuid

import tempfile
import logging
import pkg_resources
import threading

log = logging.getLogger('jamovi')


class SingleFileHandler(RequestHandler):

    def initialize(self, path, is_pkg_resource=False, mime_type=None, no_cache=False):
        self._path = path
        self._is_pkg_resource = is_pkg_resource
        self._mime_type = mime_type
        self._no_cache = no_cache

    def get(self):
        if self._mime_type is not None:
            self.set_header('Content-Type', self._mime_type)
        if self._is_pkg_resource:
            with pkg_resources.resource_stream(__name__, self._path) as file:
                content = file.read()
                self.write(content)
        else:
            with open(self._path, 'rb') as file:
                content = file.read()
                self.write(content)

    def set_extra_headers(self, path):
        if self._no_cache:
            self.set_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')


class ResourceHandler(RequestHandler):

    def get(self, instance_id, resource_id):
        instance = Instance.get(instance_id)
        if instance is None:
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write('instance ' + instance_id + ' could not be found')
            return

        resource_path = instance.get_path_to_resource(resource_id)

        with open(resource_path, 'rb') as file:
            content = file.read()
            self.write(content)


class UploadHandler(RequestHandler):
    def post(self):
        file_info = self.request.files['file'][0]
        file_name = file_info['filename']
        ext       = os.path.splitext(file_name)[1]
        content   = file_info['body']
        temp_name = str(uuid.uuid4()) + ext
        temp_file = os.path.join('/tmp', temp_name)
        with open(temp_file, 'wb') as file:
            file.write(content)


class AnalysisDescriptor(RequestHandler):

    def get(self, module_name, analysis_name, part):
        if part == '':
            part = 'js'

        module_path = Modules.instance().get(module_name).path

        if part == 'js':
            analysis_path = os.path.join(module_path, 'ui', analysis_name.lower() + '.' + part)
        else:
            analysis_path = os.path.join(module_path, 'analyses', analysis_name.lower() + '.' + part)
        analysis_path = os.path.realpath(analysis_path)

        try:
            with open(analysis_path, 'rb') as file:
                content = file.read()
                self.set_header('Content-Type', 'text/plain')
                self.write(content)
        except Exception as e:
            log.info(e)
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write(str(e))


class LoginHandler(RequestHandler):
    def post(self):
        # username = self.get_argument('username', None)
        # password = self.get_argument('password', None)
        self.set_cookie('authId', str(uuid.uuid4()))
        self.set_status(204)


class SFHandler(StaticFileHandler):
    def initialize(self, **kwargs):
        if 'no_cache' in kwargs:
            self._no_cache = kwargs['no_cache']
            del kwargs['no_cache']
        else:
            self._no_cache = False
        StaticFileHandler.initialize(self, **kwargs)

    def set_extra_headers(self, path):
        if self._no_cache:
            self.set_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')


class Server:

    def __init__(self, port, debug=False):

        if port == 0:
            self._ports = [ 0, 0, 0 ]
        else:
            self._ports = [int(port), int(port) + 1, int(port) + 2]

        self._ioloop = tornado.ioloop.IOLoop.instance()

        self._debug = debug
        self._ports_opened_listeners = [ ]

        self._thread = threading.Thread(target=self._read_stdin)
        self._thread.start()

    def add_ports_opened_listener(self, listener):
        self._ports_opened_listeners.append(listener)

    def _read_stdin(self):
        ioloop = tornado.ioloop.IOLoop.instance()
        for line in sys.stdin:
            line = line.strip()
            ioloop.add_callback(self._stdin, line)
        ioloop.add_callback(self.stop)

    def _stdin(self, line):
        if line.startswith('install: '):
            path = line[9:]
            Modules.instance().install(path)
            for instanceId, instance in Instance.instances.items():
                if instance.is_active:
                    instance._on_settings()
                    instance.rerun()
        else:
            print(line)

    def stop(self):
        tornado.ioloop.IOLoop.instance().stop()

    def start(self):

        client_path = conf.get('client_path')
        coms_path   = 'jamovi.proto'

        session_dir = tempfile.TemporaryDirectory()
        session_path = session_dir.name

        self._main_app = tornado.web.Application([
            (r'/login', LoginHandler),
            (r'/coms', ClientConnection, { 'session_path': session_path }),
            (r'/upload', UploadHandler),
            (r'/proto/coms.proto',   SingleFileHandler, {
                'path': coms_path,
                'is_pkg_resource': True,
                'mime_type': 'text/plain',
                'no_cache': self._debug }),
            (r'/analyses/(.*)/(.*)/(.*)', AnalysisDescriptor),
            (r'/analyses/(.*)/(.*)()', AnalysisDescriptor),
            (r'/(.*)', SFHandler, {
                'path': client_path,
                'default_filename': 'index.html',
                'no_cache': self._debug })
        ])

        analysisui_path = os.path.join(client_path,    'analysisui.html')
        analysisuijs_path  = os.path.join(client_path, 'analysisui.js')
        analysisuicss_path = os.path.join(client_path, 'analysisui.css')
        assets_path = os.path.join(client_path, 'assets')

        self._analysisui_app = tornado.web.Application([
            (r'/.*/', SingleFileHandler, { 'path': analysisui_path }),
            (r'/.*/analysisui.js',  SingleFileHandler, {
                'path': analysisuijs_path,
                'mime_type': 'text/javascript',
                'no_cache': self._debug }),
            (r'/.*/analysisui.css', SingleFileHandler, {
                'path': analysisuicss_path,
                'mime_type': 'text/css',
                'no_cache': self._debug }),
            (r'/.*/assets/(.*)', SFHandler, {
                'path': assets_path,
                'no_cache': self._debug }),
        ])

        resultsview_path    = os.path.join(client_path, 'resultsview.html')
        resultsviewjs_path  = os.path.join(client_path, 'resultsview.js')
        resultsviewcss_path = os.path.join(client_path, 'resultsview.css')

        self._resultsview_app = tornado.web.Application([
            (r'/.*/', SingleFileHandler, { 'path': resultsview_path }),
            (r'/.*/resultsview.js',  SingleFileHandler, { 'path': resultsviewjs_path, 'mime_type': 'text/javascript' }),
            (r'/.*/resultsview.css', SingleFileHandler, { 'path': resultsviewcss_path, 'mime_type': 'text/css' }),
            (r'/.*/assets/(.*)', SFHandler, { 'path': assets_path }),
            (r'/(.*)/res/(.*)', ResourceHandler),
        ])

        sockets = tornado.netutil.bind_sockets(self._ports[0], 'localhost')
        server = tornado.httpserver.HTTPServer(self._main_app)
        server.add_sockets(sockets)
        self._ports[0] = sockets[0].getsockname()[1]

        sockets = tornado.netutil.bind_sockets(self._ports[1], 'localhost')
        server = tornado.httpserver.HTTPServer(self._analysisui_app)
        server.add_sockets(sockets)
        self._ports[1] = sockets[0].getsockname()[1]

        sockets = tornado.netutil.bind_sockets(self._ports[2], 'localhost')
        server = tornado.httpserver.HTTPServer(self._resultsview_app)
        server.add_sockets(sockets)
        self._ports[2] = sockets[0].getsockname()[1]

        for listener in self._ports_opened_listeners:
            listener(self._ports)

        try:
            self._ioloop.start()
        except KeyboardInterrupt:
            pass
