
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
        analysis_path = os.path.join(self._path, module_name, 'silky', analysis_name + '.js')
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


class Server:

    def __init__(self, port, shutdown_on_idle=False, debug=False):

        self.port = port
        self._ioloop = tornado.ioloop.IOLoop.instance()
        self._shutdown_on_idle = shutdown_on_idle
        self._debug = debug
        self._instance = Instance()
        self._port_opened_listener = [ ]

    def add_port_opened_listener(self, listener):
        self._port_opened_listener.append(listener)

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

        self._app = tornado.web.Application([
            (r'/coms',   ClientConnection, { 'instance': self._instance }),
            (r'/upload', UploadHandler),
            (r'/proto/coms.proto',  SingleFileHandler, { 'path': coms_path, 'mime_type': 'text/plain' }),
            (r'/analyses/(.*)/(.*)', AnalysisDescriptor, { 'path': analyses_path }),
            (r'/analyses/(.*)',      ModuleDescriptor,   { 'path': analyses_path }),
            (r'/(.*)',   StaticFileHandler, { 'path': client_path, 'default_filename': 'index.html' })
        ], debug=self._debug)

        sockets = tornado.netutil.bind_sockets(self.port, 'localhost')
        server = tornado.httpserver.HTTPServer(self._app)
        server.add_sockets(sockets)

        self.port = sockets[0].getsockname()[1]
        for listener in self._port_opened_listener:
            listener(self.port)

        if self._shutdown_on_idle:
            thread = threading.Thread(target=self.check_for_shutdown)
            thread.start()

        self._ioloop.start()
