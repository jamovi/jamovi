
import tornado.ioloop
import tornado.web
import tornado.netutil
import tornado.httpserver

from tornado.web import RequestHandler
from tornado.web import StaticFileHandler
from tornado.websocket import WebSocketHandler

from instance import Instance

import os.path
import uuid
import subprocess
import sys

import json
from threading import Thread, main_thread
import time

import clientcoms

class SingleFileHandler(RequestHandler):

    def initialize(self, path, mime_type=None):
        self._path = path
        self._mime_type = mime_type

    def get(self):
        if self._mime_type != None:
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
        analysis_path = os.path.join(self._path, module_name, analysis_name + '.js')
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

class DataHandler(WebSocketHandler):

    def initialize(self, instance):
        self._instance = instance

    def check_origin(self, origin):
        return True

    def open(self):
        print('websocket opened')
        self.set_nodelay(True)
        self._instance.addHandler(self._send)

    def on_close(self):
        print('websocket closed')
        self._instance.removeHandler(self._send)

    def on_message(self, message):
        request = clientcoms.Request.create_from_bytes(message)

        self._instance.on_request(request)

    def _send(self, response):
        self.write_message(response.encode_to_bytes(), binary=True)


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

        parent = main_thread()

        while True:
            time.sleep(.2)
            if parent.is_alive() is False:
                break
            if self._instance.hasHandlers() is False and self._instance.timeWithoutHandlers() > .5:
                print('Server shutting down due to inactivity')
                ioloop = tornado.ioloop.IOLoop.instance()
                ioloop.stop()
                break

    def start(self):

        here = os.path.dirname(os.path.realpath(__file__))

        client_path = os.path.join(here, '..', 'client')
        analyses_path = os.path.join(here, '..', 'analyses')
        enginecoms_path  = os.path.join(here, 'enginecoms.proto')
        clientcoms_path  = os.path.join(here, 'clientcoms.proto')

        self._app = tornado.web.Application([
            (r'/coms',   DataHandler, { 'instance': self._instance }),
            (r'/upload', UploadHandler),
            (r'/proto/clientcoms.proto',  SingleFileHandler, { 'path' : clientcoms_path, 'mime_type' : 'text/plain' }),
            (r'/proto/enginecoms.proto',  SingleFileHandler, { 'path' : enginecoms_path, 'mime_type' : 'text/plain' }),
            (r'/analyses/(.*)/(.*)', AnalysisDescriptor, { 'path' : analyses_path }),
            (r'/analyses/(.*)',      ModuleDescriptor,   { 'path' : analyses_path }),
            (r'/(.*)',   StaticFileHandler, { 'path' : client_path, 'default_filename' : 'index.html' })
        ], debug=self._debug)

        sockets = tornado.netutil.bind_sockets(self.port, 'localhost')
        server = tornado.httpserver.HTTPServer(self._app);
        server.add_sockets(sockets)

        self.port = sockets[0].getsockname()[1]
        for listener in self._port_opened_listener:
            listener(self.port)

        if self._shutdown_on_idle:
            thread = Thread(target=self.check_for_shutdown)
            thread.start()

        self._ioloop.start()
