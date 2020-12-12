
import tornado.ioloop
import tornado.netutil
import tornado.httpserver

from tornado.web import RequestHandler
from tornado.web import StaticFileHandler as TornadosStaticFileHandler
from tornado.web import stream_request_body
from tornado.concurrent import Future
from tornado import gen

from .clientconnection import ClientConnection
from .session import Session
from .session import SessionEvent
from .modules import Modules
from .utils import conf
from jamovi.core import Dirs

import sys
import os
import os.path
import uuid
import mimetypes
import re
import json

from tempfile import NamedTemporaryFile
from tempfile import TemporaryDirectory

import logging
import pkg_resources
import threading
import asyncio

log = logging.getLogger(__name__)

tornado_major = int(tornado.version.split('.')[0])
if tornado_major < 5:
    raise RuntimeError('tornado 5+ is required')


class SingleFileHandler(RequestHandler):

    def initialize(self, path, is_pkg_resource=False, mime_type=None, extra_headers={}):
        self._path = path
        self._is_pkg_resource = is_pkg_resource
        self._mime_type = mime_type
        self._extra_headers = extra_headers

    def get(self):
        if self._mime_type is not None:
            self.set_header('Content-Type', self._mime_type)
        self.set_extra_headers(self._path)
        if self._is_pkg_resource:
            with pkg_resources.resource_stream(__name__, self._path) as file:
                content = file.read()
                self.write(content)
        else:
            with open(self._path, 'rb') as file:
                content = file.read()
                self.write(content)

    def set_extra_headers(self, path):
        for key, value in self._extra_headers.items():
            self.set_header(key, value)


class StaticFileHandler(TornadosStaticFileHandler):

    def __init__(self, *args, extra_headers={}, **kwargs):
        self._extra_headers = extra_headers
        TornadosStaticFileHandler.__init__(self, *args, **kwargs)

    def set_extra_headers(self, path):
        for key, value in self._extra_headers.items():
            self.set_header(key, value)


class ResourceHandler(RequestHandler):

    def initialize(self, session):
        self._session = session

    def get(self, instance_id, resource_id):
        instance = self._session.get(instance_id)
        if instance is None:
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write('instance ' + instance_id + ' could not be found')
            return

        resource_path = instance.get_path_to_resource(resource_id)

        mt = mimetypes.guess_type(resource_id)

        with open(resource_path, 'rb') as file:
            if mt[0] is not None:
                self.set_header('Content-Type', mt[0])
            if mt[1] is not None:
                self.set_header('Content-Encoding', mt[1])
            self.set_header('Cache-Control', 'private, no-cache, must-revalidate, max-age=0')
            content = file.read()
            self.write(content)


class ModuleAssetHandler(RequestHandler):

    def get(self, instance_id, analysis_id, path):
        instance = self._session.get(instance_id)
        if instance is None:
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write('instance ' + instance_id + ' could not be found')
            return

        analysis = instance.analyses.get(int(analysis_id))
        module_name = analysis.ns
        module_path = Modules.instance().get(module_name).path
        asset_path = os.path.join(module_path, 'R', analysis.ns, path)

        if asset_path.startswith(module_path) is False:
            self.set_status(403)
            self.write('<h1>403</h1>')
            self.write('verboten')
            return

        mt = mimetypes.guess_type(asset_path)

        with open(asset_path, 'rb') as file:
            content = file.read()
            if mt[0] is not None:
                self.set_header('Content-Type', mt[0])
            if mt[1] is not None:
                self.set_header('Content-Encoding', mt[1])
            self.set_header('Cache-Control', 'private, no-cache, must-revalidate, max-age=0')
            self.write(content)


class ModuleDescriptor(RequestHandler):

    def get(self, module_name):
        content = None
        try:
            try:
                module_path = Modules.instance().get(module_name).path
                defn_path = os.path.join(module_path, 'jamovi-full.yaml')
                with open(defn_path, 'rb') as file:
                    content = file.read()
            except (KeyError, FileNotFoundError):
                raise
            except Exception as e:
                log.exception(e)
        except Exception as e:
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write(str(e))
        else:
            self.set_header('Content-Type', 'text/yaml')
            self.write(content)


class AnalysisDescriptor(RequestHandler):

    def get(self, module_name, analysis_name, part):
        if part == '':
            part = 'js'

        content = None
        try:
            try:
                module_path = Modules.instance().get(module_name).path

                if part == 'js':
                    analysis_path = os.path.join(module_path, 'ui', analysis_name.lower() + '.' + part)
                else:
                    analysis_path = os.path.join(module_path, 'analyses', analysis_name.lower() + '.' + part)

                analysis_path = os.path.realpath(analysis_path)
                with open(analysis_path, 'rb') as file:
                    content = file.read()
            except (KeyError, FileNotFoundError):
                raise
            except Exception as e:
                log.exception(e)
        except Exception as e:
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write(str(e))
        else:
            self.set_header('Content-Type', 'text/plain')
            self.write(content)


class EntryHandler(RequestHandler):

    def initialize(self, session):
        self._session = session

    def get(self):
        instance = self._session.create()
        query = self.get_argument('open', '')
        if query:
            query = '?open=' + query
        self.redirect('/%s/%s' % (instance.id, query))


class OpenHandler(RequestHandler):

    def initialize(self, session):
        self._session = session

    async def get(self, instance_id=None):

        instance = None
        url = self.get_query_argument('url', '')

        if instance_id:
            instance = self._session.get(instance_id)
            if instance is None:
                self.write('{"status":"terminated","message":"This data set is no longer available"}')
                return
            elif url == '' and instance._data.has_dataset:
                self.set_status(204)
                return

        title = self.get_query_argument('title', None)
        temp = self.get_query_argument('temp', '0')

        try:
            if instance is None:
                instance = self._session.create()
            async for progress in instance.open(url, title, temp == '1'):
                self._write('progress', progress)
        except Exception as e:
            self._write(e)
        else:
            self._write('OK', redirect=instance.id)

    async def post(self, instance_id=None):
        try:
            file = self.request.files['file'][-1]
        except KeyError:
            self.set_status(400)
            self.write('400: Bad Request')
            return

        try:
            base, ext = os.path.splitext(file.filename)
            temp_file = NamedTemporaryFile(suffix=ext)
            with open(temp_file.name, 'wb') as writer:
                writer.write(file.body)
            instance = self._session.create()
            async for progress in instance.open(temp_file.name, base, True):
                self._write('progress', progress)
        except Exception as e:
            log.exception(e)
            self._write(e)
        else:
            self._write('OK', redirect=instance.id)

    def _write(self, status, progress=None, redirect=None):
        if status == 'OK':
            if redirect is not None:
                self.write(f'{{"status":"OK","url":"{ redirect }/"}}\n')
            else:
                self.write('{"status":"OK"}\n')
        elif isinstance(status, BaseException):
            message = str(status)
            if not message:
                message = type(status).__name__
            self.write(f'{{"status":"error","message":"{ message }"}}\n')
        else:
            p, n = progress
            self.write(f'{{"status":"in-progress","p":{ p },"n":{ n }}}\n')
        self.flush()


@stream_request_body
class PDFConverter(RequestHandler):

    def initialize(self, pdfservice):
        self._pdfservice = pdfservice
        self._file = None

    def prepare(self):
        self._file = NamedTemporaryFile(suffix='.html')

    def data_received(self, data):
        self._file.write(data)

    @gen.coroutine
    def post(self):
        self._file.flush()
        try:
            pdf_path = yield self._pdfify()
            with open(pdf_path, 'rb') as file:
                content = file.read()
                self.set_header('Content-Type', 'application/pdf')
                self.write(content)
        except Exception as e:
            self.set_status(500)
            self.write(str(e))

    def _pdfify(self):
        self._future = Future()
        self._pdfservice._request({
            'cmd': 'convert-to-pdf',
            'args': [ self._file.name ],
            'waiting': self._future })
        return self._future


class DatasetsList(RequestHandler):

    def initialize(self, session):
        self._session = session

    def get(self):
        datasets = [ ]
        for id, instance in self._session.items():
            datasets.append({
                'id': id,
                'title': instance._data.title,
                'buffer': instance._buffer_path,
                'rowCount': instance._data.row_count,
                'columnCount': instance._data.column_count,
            })
        self.set_header('Content-Type', 'application/json')
        self.set_header('Cache-Control', 'private, no-store, must-revalidate, max-age=0')
        self.write(json.dumps(datasets))


class Server:

    ETRON_RESP_REGEX = re.compile(r'^response: ([a-z-]+) \(([0-9]+)\) ([10]) ?"(.*)"\n?$')
    ETRON_NOTF_REGEX = re.compile(r'^notification: ([a-z-]+) ?(.*)\n?$')

    def __init__(self,
                 port,
                 host='127.0.0.1',
                 session_id=None,
                 slave=False,
                 stdin_slave=False,
                 debug=False):

        self._session = None

        if session_id is not None:
            self._session_id = session_id
        else:
            self._session_id = str(uuid.uuid4())

        if port == 0:
            self._ports = [ 0, 0, 0 ]
        else:
            self._ports = [int(port), int(port) + 1, int(port) + 2]

        self._ioloop = asyncio.get_event_loop()

        self._host = host
        self._slave = slave and not stdin_slave
        self._stdin_slave = stdin_slave
        self._debug = debug
        self._ports_opened_listeners = [ ]

        self._spool_dir = conf.get('spool-dir')
        if self._spool_dir is None:
            self._spool = TemporaryDirectory()
            self._spool_dir = self._spool.name

        if stdin_slave:
            self._thread = threading.Thread(target=self._read_stdin)
            self._thread.daemon = True
            self._thread.start()

        self._etron_reqs = [ ]
        self._etron_req_id = 0
        self._port_file = None

    def _set_update_status(self, status):
        self._request({
            'cmd': 'software-update',
            'args': [ status ] })

    def _request(self, request):
        request['id'] = str(self._etron_req_id)
        self._etron_req_id += 1
        self._etron_reqs.append(request)
        cmd = 'request: {} ({}) "{}"\n'.format(
            request['cmd'],
            request['id'],
            request['args'][0])
        sys.stdout.write(cmd)
        sys.stdout.flush()

    def add_ports_opened_listener(self, listener):
        self._ports_opened_listeners.append(listener)

    def _read_stdin(self):
        try:
            for line in sys.stdin:
                line = line.strip()
                asyncio.run_coroutine_threadsafe(self._process_stdin(line), self._ioloop)
        except OSError:
            pass
        self._ioloop.call_soon_threadsafe(self.stop)

    async def _process_stdin(self, line):

        match = Server.ETRON_RESP_REGEX.match(line)

        if match:
            id = match.group(2)
            for request in self._etron_reqs:
                if request['id'] == id:
                    if match.group(3) == '1':
                        request['waiting'].set_result(match.group(4))
                    else:
                        request['waiting'].set_exception(RuntimeError(match.group(4)))
                    self._etron_reqs.remove(request)
                    return

        match = Server.ETRON_NOTF_REGEX.match(line)

        if match:
            notification_type = match.group(1)
            notification_message = match.group(2)
            if notification_type == 'update':
                self._session.set_update_status(notification_message)
            return

        if line.startswith('install: ') or line.startswith('install-and-quit: '):
            if line.startswith('install: '):
                path = line[9:]
                quit = False
            else:
                path = line[18:]
                quit = True

            try:
                await self._session.restart_engines()
                Modules.instance().install_from_file(path)
                self._session.notify_global_changes()
                self._session.rerun_analyses()
            except Exception:
                import traceback
                print(traceback.format_exc())

            if quit:
                self.stop()
        else:
            sys.stderr.write(line)
            sys.stderr.flush()

    def _lonely_suicide(self):
        if len(self._session) == 0:
            self.stop()

    def stop(self):
        self._ioloop.stop()
        try:
            os.remove(self._port_file)
        except Exception:
            pass

    def start(self):
        asyncio.ensure_future(self._run())
        try:
            self._ioloop.run_forever()
        except KeyboardInterrupt:
            pass

    async def _run(self):

        client_path = conf.get('client_path')
        version_path = conf.get('version_path', False)
        if not version_path:
            version_path = os.path.join(conf.get('home'), 'Resources', 'jamovi', 'version')
        coms_path   = 'jamovi.proto'

        session_path = os.path.join(self._spool_dir, self._session_id)
        os.makedirs(session_path)

        self._session = Session(self._spool_dir, self._session_id)
        self._session.set_update_request_handler(self._set_update_status)
        self._session.add_session_listener(self._session_event)
        await self._session.start()

        assets_path = os.path.join(client_path, 'assets')

        if conf.get('devel', False):
            cache_headers = { 'Cache-Control': 'private, no-cache, must-revalidate, max-age=0' }
        else:
            cache_headers = { 'Cache-Control': 'private, max-age=60' }

        self._main_app = tornado.web.Application([
            (r'/', EntryHandler, { 'session': self._session }),
            (r'/open', OpenHandler, { 'session': self._session }),
            (r'/version', SingleFileHandler, {
                'path': version_path }),
            (r'/([a-f0-9-]+)/open', OpenHandler, { 'session': self._session }),
            (r'/([a-f0-9-]+)/coms', ClientConnection, { 'session': self._session }),
            (r'/proto/coms.proto', SingleFileHandler, {
                'path': coms_path,
                'is_pkg_resource': True,
                'mime_type': 'text/plain' }),
            (r'/modules/([0-9a-zA-Z]+)', ModuleDescriptor),
            (r'/analyses/([0-9a-zA-Z]+)/([0-9a-zA-Z]+)/([.0-9a-zA-Z]+)', AnalysisDescriptor),
            (r'/analyses/([0-9a-zA-Z]+)/([0-9a-zA-Z]+)()', AnalysisDescriptor),
            (r'/utils/to-pdf', PDFConverter, { 'pdfservice': self }),
            (r'/api/datasets', DatasetsList, { 'session': self._session }),
            (r'/assets/(.*)', StaticFileHandler, {
                'path': assets_path }),
            (r'/[a-f0-9-]+/()', StaticFileHandler, {
                'path': client_path,
                'default_filename': 'index.html',
                'extra_headers': cache_headers }),
            (r'/([-0-9a-z.]*)', StaticFileHandler, {
                'path': client_path,
                'extra_headers': cache_headers })
        ])

        analysisui_path = os.path.join(client_path, 'analysisui.html')

        self._analysisui_app = tornado.web.Application([
            (r'/[-0-9a-f]+/', SingleFileHandler, {
                'path': analysisui_path,
                'extra_headers': cache_headers }),
            (r'/(analysisui\.js)', StaticFileHandler, {
                'path': client_path,
                'extra_headers': cache_headers }),
            (r'/(analysisui\.css)', StaticFileHandler, {
                'path': client_path,
                'extra_headers': cache_headers }),
            (r'/assets/([-.0-9a-zA-Z]+)', StaticFileHandler, {
                'path': assets_path }),
        ])

        resultsview_path    = os.path.join(client_path, 'resultsview.html')

        self._resultsview_app = tornado.web.Application([
            (r'/[-0-9a-z]+/[0-9]+/', SingleFileHandler, {
                'path': resultsview_path,
                'extra_headers': cache_headers }),
            (r'/(resultsview\.js)', StaticFileHandler, {
                'path': client_path,
                'extra_headers': cache_headers }),
            (r'/(resultsview\.css)', StaticFileHandler, {
                'path': client_path,
                'extra_headers': cache_headers }),
            (r'/assets/([-.0-9a-zA-Z]+)', StaticFileHandler, {
                'path': assets_path }),
            (r'/([-0-9a-z]+)/[0-9]+/res/(.+)', ResourceHandler, {
                'session': self._session }),
            (r'/([-0-9a-z]+)/([0-9]+)/module/(.+)',
                ModuleAssetHandler),
        ])

        sockets = tornado.netutil.bind_sockets(self._ports[0], self._host)
        server = tornado.httpserver.HTTPServer(self._main_app)
        server.add_sockets(sockets)
        self._ports[0] = sockets[0].getsockname()[1]

        sockets = tornado.netutil.bind_sockets(self._ports[1], self._host)
        server = tornado.httpserver.HTTPServer(self._analysisui_app)
        server.add_sockets(sockets)
        self._ports[1] = sockets[0].getsockname()[1]

        sockets = tornado.netutil.bind_sockets(self._ports[2], self._host)
        server = tornado.httpserver.HTTPServer(self._resultsview_app)
        server.add_sockets(sockets)
        self._ports[2] = sockets[0].getsockname()[1]

        for listener in self._ports_opened_listeners:
            listener(self._ports)

        if self._slave:
            check = tornado.ioloop.PeriodicCallback(self._lonely_suicide, 1000)
            self._ioloop.call_later(3, check.start)

        # write the port no. to a file, so external software can
        # find out what port jamovi is running on
        app_data = Dirs.app_data_dir()
        port_name = str(self._ports[0]) + '.port'
        self._port_file = os.path.join(app_data, port_name)
        with open(self._port_file, 'w'):
            pass

        for entry in os.scandir(app_data):
            if entry.name == port_name:
                continue
            if entry.name.endswith('.port') and entry.is_file():
                os.remove(entry.path)

    def _session_event(self, event):
        if event.type == SessionEvent.Type.INSTANCE_STARTED:
            sys.stdout.write('%s %s\n' % ('instance_started', event.instance_id))
            sys.stdout.flush()
        elif event.type == SessionEvent.Type.INSTANCE_ENDED:
            sys.stdout.write('%s %s\n' % ('instance_ended', event.instance_id))
            sys.stdout.flush()
