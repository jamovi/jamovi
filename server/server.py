
import tornado.ioloop
import tornado.netutil
import tornado.httpserver

from tornado.web import RequestHandler
from tornado.web import StaticFileHandler

from clientconnection import ClientConnection
from instance import Instance

import os.path
import uuid

import threading
import time
import tempfile


class SingleFileHandler(RequestHandler):

    def initialize(self, path, mime_type=None):
        self._path = path
        self._mime_type = mime_type

    def get(self):
        if self._mime_type is not None:
            self.set_header('Content-Type', self._mime_type)
        with open(self._path, 'rb') as file:
            content = file.read()
            self.write(content)


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


class ModuleDescriptor(RequestHandler):
    def initialize(self, path):
        self._path = path

    def get(self, module_name):
        module_json_path = os.path.join(self._path, module_name, 'module.json')
        module_json_path = os.path.realpath(module_json_path)
        try:
            with open(module_json_path, 'rb') as file:
                content = file.read()
                self.set_header('Content-Type', 'text/plain')
                self.write(content)
        except Exception as e:
            print(e)
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write(str(e))


class AnalysisDescriptor(RequestHandler):
    def initialize(self, path):
        self._path = path

    def get(self, module_name, analysis_name):
        analysis_path = os.path.join(self._path, module_name, 'silky', analysis_name.lower() + '.js')
        analysis_path = os.path.realpath(analysis_path)
        try:
            with open(analysis_path, 'rb') as file:
                content = file.read()
                self.set_header('Content-Type', 'text/plain')
                self.write(content)
        except Exception as e:
            print(e)
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write(str(e))


class LoginHandler(RequestHandler):
    def post(self):
        # username = self.get_argument('username', None)
        # password = self.get_argument('password', None)
        self.set_cookie('authId', str(uuid.uuid4()))
        self.set_status(204)


class Server:

    def __init__(self, port, shutdown_on_idle=False, debug=False):

        if port == 0:
            self._ports = [ 0, 0, 0 ]
        else:
            self._ports = [int(port), int(port) + 1, int(port) + 2]

        self._ioloop = tornado.ioloop.IOLoop.instance()
        self._shutdown_on_idle = shutdown_on_idle
        self._debug = debug
        self._ports_opened_listeners = [ ]

    def add_ports_opened_listener(self, listener):
        self._ports_opened_listeners.append(listener)

    def check_for_shutdown(self):

        parent = threading.main_thread()
        time_without_listeners = None

        while True:
            time.sleep(.2)
            if parent.is_alive() is False:
                break

            now = time.time()

            if ClientConnection.number_of_connections == 0:
                if time_without_listeners is None:
                    time_without_listeners = now
                elif now - time_without_listeners > 1:
                    print('Server shutting down due to inactivity')
                    tornado.ioloop.IOLoop.instance().stop()
                    break
            else:
                time_without_listeners = None

    def start(self):

        here = os.path.dirname(os.path.realpath(__file__))

        client_path = os.path.join(here, '..', 'client')
        analyses_path = os.path.join(here, '..', 'analyses')
        coms_path  = os.path.join(here, 'silkycoms.proto')

        session_dir = tempfile.TemporaryDirectory()
        session_path = session_dir.name

        self._main_app = tornado.web.Application([
            (r'/login', LoginHandler),
            (r'/coms', ClientConnection, { 'session_path': session_path }),
            (r'/upload', UploadHandler),
            (r'/proto/coms.proto',   SingleFileHandler, { 'path': coms_path, 'mime_type': 'text/plain' }),
            (r'/analyses/(.*)/(.*)', AnalysisDescriptor, { 'path': analyses_path }),
            (r'/analyses/(.*)',      ModuleDescriptor,   { 'path': analyses_path }),
            (r'/(.*)',   StaticFileHandler, { 'path': client_path, 'default_filename': 'index.html' })
        ])

        analysisui_path = os.path.join(client_path,    'analysisui.html')
        analysisuijs_path  = os.path.join(client_path, 'analysisui.js')
        analysisuicss_path = os.path.join(client_path, 'analysisui.css')
        assets_path = os.path.join(client_path, 'assets')

        self._analysisui_app = tornado.web.Application([
            (r'/.*/', SingleFileHandler, { 'path': analysisui_path }),
            (r'/.*/analysisui.js',  SingleFileHandler, { 'path': analysisuijs_path, 'mime_type': 'text/javascript' }),
            (r'/.*/analysisui.css', SingleFileHandler, { 'path': analysisuicss_path, 'mime_type': 'text/css' }),
            (r'/.*/assets/(.*)', StaticFileHandler, { 'path': assets_path }),
        ])

        resultsview_path    = os.path.join(client_path, 'resultsview.html')
        resultsviewjs_path  = os.path.join(client_path, 'resultsview.js')
        resultsviewcss_path = os.path.join(client_path, 'resultsview.css')

        self._resultsview_app = tornado.web.Application([
            (r'/.*/', SingleFileHandler, { 'path': resultsview_path }),
            (r'/.*/resultsview.js',  SingleFileHandler, { 'path': resultsviewjs_path, 'mime_type': 'text/javascript' }),
            (r'/.*/resultsview.css', SingleFileHandler, { 'path': resultsviewcss_path, 'mime_type': 'text/css' }),
            (r'/.*/assets/(.*)', StaticFileHandler, { 'path': assets_path }),
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

        if self._shutdown_on_idle:
            thread = threading.Thread(target=self.check_for_shutdown)
            thread.start()

        self._ioloop.start()
