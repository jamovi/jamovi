
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
from .utils import conf
from .appinfo import app_info
from jamovi.core import Dirs
from .i18n import _
from .webhandlers import ForwardHandler

from .exceptions import FileExistsException
from .exceptions import UserException

import sys
import os
import os.path
import uuid
import mimetypes
import re
import json

from urllib.parse import urlparse
from tempfile import NamedTemporaryFile
from tempfile import TemporaryDirectory
from shutil import rmtree

import logging
import pkg_resources
import threading
import asyncio
from asyncio import create_task

log = logging.getLogger(__name__)

tornado_major = int(tornado.version.split('.')[0])
if tornado_major < 5:
    raise RuntimeError('tornado 5+ is required')


access_key = conf.get('access_key', None)
access_key_generated = False

if access_key is None:
    access_key = uuid.uuid4().hex
    access_key_generated = True
    conf.set('access_key', access_key)


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


class SessHandler(RequestHandler):

    def initialize(self, session):
        self._session = session


class ResourceHandler(SessHandler):

    def get(self, instance_id, resource_id):
        instance = self._session.get(instance_id)
        if instance is None:
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write('instance ' + instance_id + ' could not be found')
            return

        mt = mimetypes.guess_type(resource_id)
        if mt[0] is not None:
            self.set_header('Content-Type', mt[0])
        if mt[1] is not None:
            self.set_header('Content-Encoding', mt[1])

        if conf.get('xaccel_use', '0') != '0':
            xaccel_root = conf.get('xaccel_root')
            resource_path = f'/{ xaccel_root }/{ instance_id }/{ resource_id }'
            self.set_header('X-Accel-Redirect', resource_path)
        else:
            resource_path = instance.get_path_to_resource(resource_id)
            with open(resource_path, 'rb') as file:
                self.set_header('Cache-Control', 'private, no-cache, must-revalidate, max-age=0')
                content = file.read()
                self.write(content)


class ModuleAssetHandler(SessHandler):

    def get(self, instance_id, analysis_id, path):
        instance = self._session.get(instance_id)
        if instance is None:
            self.set_status(404)
            self.write('<h1>404</h1>')
            self.write('instance ' + instance_id + ' could not be found')
            return

        analysis = instance.analyses.get(int(analysis_id))
        module_name = analysis.ns
        module_path = self._session.modules.get(module_name).path
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


class ModuleI18nDescriptor(SessHandler):

    def get(self, module_name, code):
        content = None
        try:
            try:
                module_path = self._session.modules.get(module_name).path
                defn_path = os.path.join(module_path, 'R', module_name, 'i18n', f'{ code }.json')
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
            self.set_header('Content-Type', 'application/json')
            self.set_header('Cache-Control', 'private, no-store, must-revalidate, max-age=0')
            self.write(content)


class ModuleDescriptor(SessHandler):

    def get(self, module_name):
        content = None
        try:
            try:
                module_path = self._session.modules.get(module_name).path
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


class AnalysisDescriptor(SessHandler):

    def get(self, module_name, analysis_name, part):
        if part == '':
            part = 'js'

        content = None
        try:
            try:
                module_path = self._session.modules.get(module_name).path

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

    async def get(self):

        required_key = conf.get('access_key', '')
        if required_key != '':
            provided_key = self.get_argument('access_key', None)
            if provided_key is None:
                self.set_status(401)
                self.write('<h1>access key required</h1>')
                self.write('<p>You must append ?access_key=... onto your URL</p>')
                return
            elif provided_key != required_key:
                self.set_status(401)
                self.write('<h1>auth failed</h1>')
                self.write('<p>provided access key is not correct</p>')
                return
            else:
                self.set_cookie('access_key', provided_key)

        instance = await self._session.create()
        query = ''
        if self.request.query:
            query = f'?{ self.request.query }'
        self.redirect('/%s/%s' % (instance.id, query))


class OpenHandler(RequestHandler):

    def initialize(self, session):
        self._session = session
        self._access_key = conf.get('access_key', '')

    def prepare(self, instance_id=None):
        if self._access_key != '':
            key_provided = self.get_cookie('access_key', None)
            if key_provided is None:
                self.write(f'{{"status":"error","message":{ json.dumps(_("Authentication required")) }}}\n')
                self.finish()
            elif self._access_key != key_provided:
                self.write(f'{{"status":"error","message":{ json.dumps(_("Authentication failure")) }}}\n')
                self.finish()

    async def get(self, instance_id=None):

        instance = None
        url = self.get_query_argument('url', '')

        lang_code = self.request.headers.get('Accept-Language', 'en')

        self._session.set_language(lang_code)

        if instance_id:
            instance = self._session.get(instance_id)
            if instance is None:
                self.write(f'{{"status":"terminated","message":{ json.dumps(_("This data set is no longer available")) }}}')
                return
            elif url == '' and instance._data.has_dataset:
                self.set_status(204)
                return

        title = self.get_query_argument('title', None)
        is_temp = self.get_query_argument('temp', False) != False
        ext = None

        filename = self.get_query_argument('filename', None)
        if filename:
            name, ext = os.path.splitext(filename)
            if ext != '':
                ext = ext[1:].lower()  # trim leading dot
            if title is None:
                title = name

        try:
            if instance is None:
                instance = await self._session.create()
            async for progress in instance.open(url, title, is_temp, ext):
                self._write('progress', progress)
        except Exception as e:
            log.exception(e)
            self._write(e)
        else:
            self._write('OK', redirect=instance.id)

    async def post(self, instance_id=None):

        file_path: str
        file_title = None
        file_ext = None
        options: dict = { }

        try:
            options_json = self.get_body_argument('options', '{}')
            options_dict = json.loads(options_json)
            if isinstance(options_dict, dict):
                options = options_dict
        except (KeyError, ValueError):
            pass

        if 'file' in self.request.files:
            # jamovi handling uploads directly
            file = self.request.files['file'][-1]
            file_title, ext = os.path.splitext(file.filename)
            temp_file = NamedTemporaryFile(suffix=ext)
            with open(temp_file.name, 'wb') as writer:
                writer.write(file.body)
            file_path = temp_file.name
            is_temp = True
        elif 'path' in options:
            # jamovi desktop open from path
            file_path = options['path']
            is_temp = (options.get('temp', False) != False)
            file_title = options.get('title')
        elif 'file.path' in self.request.body_arguments:
            # jamovi sitting behind a reverse proxy that handles the uploads (nginx)
            file_path = self.get_body_argument('file.path')
            filename = self.get_body_argument('file.name')
            file_title, dot_ext = os.path.splitext(filename)
            file_ext = dot_ext[1:]
            is_temp = True
        else:
            self.set_status(400)
            self.write('400: Bad Request')
            return

        lang_code = self.request.headers.get('Accept-Language', 'en')
        self._session.set_language(lang_code)

        try:
            instance = await self._session.create()
            async for progress in instance.open(file_path, title=file_title, is_temp=is_temp, ext=file_ext, options=options):
                self._write('progress', progress)
                await self.flush()
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
            self.write(f'{{"status":"error","message":{ json.dumps(message) }}}\n')
        else:
            p, n = progress
            self.write(f'{{"status":"in-progress","p":{ p },"n":{ n }}}\n')


class SaveHandler(SessHandler):

    async def post(self, instance_id: str):

        instance = self._session.get(instance_id)
        if instance is None:
            self.set_status(404)
            self.write('404: Not Found')
            return

        options: dict = { }

        try:
            options_json = self.get_body_argument('options', '{}')
            options_dict = json.loads(options_json)
            if isinstance(options_dict, dict):
                options = options_dict
        except (KeyError, ValueError):
            pass

        content_file = self.request.files.get('content', None)
        if content_file is not None:
            options['content'] = content_file[-1].body

        self.set_header('content-type', 'text/plain')  # jsonlines, so text/plain

        data: dict

        try:
            stream = instance.save(options)
            async for progress in stream:
                p, n = progress
                self.write(f'{{"status":"in-progress","p":{ p },"n":{ n }}}\n')
                await self.flush()
            data = { 'status': 'OK' }
            data.update(await stream)
        except FileExistsException:
            data = { 'status': 'error', 'code': 'file-exists'}
        except UserException as e:
            data = { 'status': 'error', 'message': e.cause }

        content = json.dumps(data)
        self.write(content)


@stream_request_body
class PDFConverter(RequestHandler):

    def initialize(self, pdfservice):
        self._pdfservice = pdfservice
        self._file = None

    def prepare(self):
        self._file = NamedTemporaryFile(suffix='.html', delete=False)

    def data_received(self, data):
        self._file.write(data)

    @gen.coroutine
    def post(self):
        self._file.close()
        try:
            pdf_path = yield self._pdfify()
            with open(pdf_path, 'rb') as file:
                content = file.read()
                self.set_header('Content-Type', 'application/pdf')
                self.write(content)
        except Exception as e:
            self.set_status(500)
            self.write(str(e))
        finally:
            try:
                os.remove(self._file.name)
            except Exception:
                pass

    def _pdfify(self):
        self._future = Future()
        self._pdfservice._request({
            'cmd': 'convert-to-pdf',
            'args': [ self._file.name ],
            'waiting': self._future })
        return self._future


class DatasetsList(SessHandler):

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


class AuthTokenHandler(SessHandler):

    def post(self):
        authorization = self.request.headers.get('authorization')
        if authorization is None:
            pass
        elif not authorization.strip().startswith('Bearer '):
            self.set_status(400)
            self.write('unsupported authorization scheme')
        else:
            token = authorization.strip()[7:].strip()
            self._session.set_auth(token)


class SettingsHandler(AuthTokenHandler):
    def post(self):
        super().post()
        if self.get_status() < 400:
            content = self.request.body.decode('utf-8')
            settings = json.loads(content)
            self._session.apply_settings(settings)


class VersionHandler(RequestHandler):
    def get(self):
        self.write(app_info.version)


class I18nManifestHandler(RequestHandler):

    manifest = None

    def initialize(self, session, path):
        self._session = session
        self._path = path

    def get(self):
        if I18nManifestHandler.manifest is None:
            with open(self._path) as file:
                I18nManifestHandler.manifest = json.load(file)

        self.set_header('Content-Type', 'application/json')

        current = self._session.get_language()
        if current:
            manifest = { }
            manifest.update(I18nManifestHandler.manifest)
            manifest['current'] = current
            self.write(json.dumps(manifest))
        else:
            self.write(json.dumps(I18nManifestHandler.manifest))


class DownloadFileHandler(TornadosStaticFileHandler):
    def set_extra_headers(self, path):
        filename = self.get_argument('filename', None)
        if filename:
            self.set_header(
                'Content-Disposition',
                f'attachment; filename="{ filename }"')


class EndHandler(SessHandler):
    def post(self):
        self._session.stop()


class ConfigJSHandler(RequestHandler):
    def initialize(self, roots):
        self._roots = roots

    def get(self):
        self.set_header('Content-Type', 'application/javascript')
        self.write(f'window.config = {{"client":{{"roots":["{ self._roots[0] }","{ self._roots[1] }","{ self._roots[2] }"]}}}}')


class Server:

    ETRON_RESP_REGEX = re.compile(r'^response: ([a-z-]+) \(([0-9]+)\) ([10]) ?"(.*)"\n?$')
    ETRON_NOTF_REGEX = re.compile(r'^notification: ([a-z-]+) ?(.*)\n?$')

    def __init__(self,
                 port,
                 host='127.0.0.1',
                 session_id=None,
                 stdin_slave=False,
                 debug=False,
                 dev_server=None):

        # these are mostly not necessary, however the mimetypes library relies
        # on OS level config, and this can be bad/wrong. so we override these
        # here to prevent a badly configured system from serving up bad mime
        # types. we found some windows machines serving up application/x-css
        # for .css files ...
        mimetypes.add_type('text/html', '.html')
        mimetypes.add_type('application/javascript', '.js')
        mimetypes.add_type('text/css', '.css')
        mimetypes.add_type('image/svg+xml', '.svg')
        mimetypes.add_type('text/protobuf', '.proto')
        mimetypes.add_type('application/json', '.json')
        mimetypes.add_type('font/woff', '.woff')

        self._session = None

        if session_id is not None:
            self._session_id = session_id
        else:
            self._session_id = str(uuid.uuid4())

        self._ioloop = asyncio.get_event_loop()

        self._host = host
        self._stdin_slave = stdin_slave
        self._debug = debug
        self._dev_server = dev_server

        self.ports_opened = self._ioloop.create_future()

        self._spool_path = conf.get('spool_path')
        if self._spool_path is None:
            self._spool = TemporaryDirectory()
            self._spool_path = self._spool.name

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
                await self._session.modules.install_from_file(path)
                self._session.notify_global_changes()
            except Exception:
                import traceback
                print(traceback.format_exc())

            if quit:
                self.stop()
        else:
            sys.stderr.write(line)
            sys.stderr.flush()

    def stop(self):
        if self._session is not None:
            self._session.stop()

    def start(self):
        t = create_task(self._run())
        t.add_done_callback(lambda t: t.result())

    async def wait_ended(self):
        if self._session is not None:
            await self._session.wait_ended()

    async def _run(self):

        client_path = conf.get('client_path')

        i18n_path = conf.get('i18n_path', None)
        if i18n_path is None:
            i18n_path = os.path.join(conf.get('home'), 'i18n', 'json')

        session_path = os.path.join(self._spool_path, self._session_id)
        os.makedirs(session_path)

        self._session = Session(self._spool_path, self._session_id)
        self._session.set_update_request_handler(self._set_update_status)
        self._session.add_session_listener(self._session_event)

        await self._session.start()

        assets_path = os.path.join(client_path, 'assets')

        if conf.get('devel', False):
            cache_headers = { 'Cache-Control': 'private, no-cache, must-revalidate, max-age=0' }
        else:
            cache_headers = { 'Cache-Control': 'private, max-age=60' }

        ping_interval = conf.get('timeout_no_websocket_ping_interval')
        ping_timeout = conf.get('timeout_no_websocket_ping')
        if ping_interval:
            ping_interval = int(ping_interval)
        if ping_timeout:
            ping_timeout = int(ping_timeout)

        host = conf.get('hostname', '127.0.0.1')
        host_a = conf.get('host_a', host)
        host_b = conf.get('host_b', host_a if re.match(r'[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+', host) else f'a.{ host_a }')
        host_c = conf.get('host_c', host_a if re.match(r'[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+', host) else f'r.{ host_a }')

        host_a = urlparse(f'//{ host_a }')
        host_b = urlparse(f'//{ host_b }')
        host_c = urlparse(f'//{ host_c }')

        path_a = host_a.path.rstrip('/')
        path_b = host_b.path.rstrip('/')
        path_c = host_c.path.rstrip('/')

        port_a = host_a.port
        port_b = host_b.port
        port_c = host_c.port

        host_a = host_a.hostname
        host_b = host_b.hostname
        host_c = host_c.hostname

        roots = [ ]

        if host_a != host_b and host_b != host_c:
            separate_by = 'host'
        elif path_a != path_b and path_b != path_c:
            separate_by = 'path'
            if port_a is None:
                port_a = 80
        elif port_a is None and port_b is None and port_c is None:
            separate_by = 'port'
            port_a = port_b = port_c = 0
        elif port_a != port_b and port_b != port_c:
            separate_by = 'port'
        else:
            raise ValueError

        self._main_app = tornado.web.Application(
            websocket_ping_interval=ping_interval,
            websocket_ping_timeout=ping_timeout)

        if separate_by == 'port':
            self._analysisui_app = tornado.web.Application()
            self._resultsview_app = tornado.web.Application()
        else:
            self._analysisui_app = self._main_app
            self._resultsview_app = self._main_app

        match_a = re.escape(host_a) if host_a else '.*'
        match_b = re.escape(host_b) if host_b else '.*'
        match_c = re.escape(host_c) if host_c else '.*'

        self._main_app.add_handlers(match_a, [
            (fr'{ path_a }/', EntryHandler, { 'session': self._session }),
            (fr'{ path_a }/config.js', ConfigJSHandler, { 'roots': roots }),
            (fr'{ path_a }/open', OpenHandler, { 'session': self._session }),
            (fr'{ path_a }/auth', AuthTokenHandler, { 'session': self._session }),
            (fr'{ path_a }/settings', SettingsHandler, { 'session': self._session }),
            (fr'{ path_a }/end', EndHandler, { 'session': self._session }),
            (fr'{ path_a }/version', VersionHandler),
            (fr'{ path_a }/([a-f0-9-]+)/open', OpenHandler, { 'session': self._session }),
            (fr'{ path_a }/([a-f0-9-]+)/save', SaveHandler, { 'session': self._session }),
            (fr'{ path_a }/([a-f0-9-]+)/coms', ClientConnection, { 'session': self._session }),
            (fr'{ path_a }/([a-f0-9-]+/dl/.*)', DownloadFileHandler, { 'path': self._session.session_path }),
            (fr'{ path_a }/modules/([0-9a-zA-Z]+)', ModuleDescriptor, { 'session': self._session }),
            (fr'{ path_a }/modules/([0-9a-zA-Z]+)/i18n/([a-z]{{2}}(?:-[a-z]{{2}})?)', ModuleI18nDescriptor, { 'session': self._session }),
            (fr'{ path_a }/analyses/([0-9a-zA-Z]+)/([0-9a-zA-Z]+)/([.0-9a-zA-Z]+)', AnalysisDescriptor, { 'session': self._session }),
            (fr'{ path_a }/analyses/([0-9a-zA-Z]+)/([0-9a-zA-Z]+)()', AnalysisDescriptor, { 'session': self._session }),
            (fr'{ path_a }/utils/to-pdf', PDFConverter, { 'pdfservice': self }),
            (fr'{ path_a }/api/datasets', DatasetsList, { 'session': self._session }),
            (fr'{ path_a }/i18n/', I18nManifestHandler, {
                'session': self._session,
                'path': f'{ i18n_path }/manifest.json' }),
            (fr'{ path_a }/i18n/(.+)', StaticFileHandler, { 'path': i18n_path }),
        ])

        try:
            from .extras import get_extra_handlers
            extra_handlers = get_extra_handlers()
            for h_path, handler in extra_handlers:
                h_path = f'{ path_a }{ h_path }'
                self._main_app.add_handlers(match_a, [ (h_path, handler, { 'session': self._session }) ])
        except ImportError:
            pass

        if self._dev_server:
            self._main_app.add_handlers(match_a, [
                (fr'{ path_a }/(@vite/client)', ForwardHandler, {
                    'base_url': self._dev_server }),
                (fr'{ path_a }/[a-f0-9-]+/(.*)', ForwardHandler, {
                    'base_url': self._dev_server }),
                (fr'{ path_a }/(.*)', ForwardHandler, {
                    'base_url': self._dev_server }),
            ])
        else:
            self._main_app.add_handlers(match_a, [
                (fr'{ path_a }/assets/(.*)', StaticFileHandler, {
                    'path': assets_path }),
                (fr'{ path_a }/[a-f0-9-]+/()', StaticFileHandler, {
                    'path': client_path,
                    'default_filename': 'index.html',
                    'extra_headers': cache_headers }),
                (fr'{ path_a }/([-0-9a-z.]*)', StaticFileHandler, {
                    'path': client_path,
                    'extra_headers': cache_headers })
            ])

        if self._dev_server:

            self._analysisui_app.add_handlers(match_b, [
                (fr'{ path_b }/', VersionHandler),  # send back garbage to abort the vite web socket
                (fr'{ path_b }/[a-f0-9-]+/(.*)', ForwardHandler, {
                    'base_url': self._dev_server, 'default_filename': 'analysisui.html' }),
                (fr'{ path_b }/(.*)', ForwardHandler, {
                    'base_url': self._dev_server }),
            ])

            self._resultsview_app.add_handlers(match_c, [
                (fr'{ path_c }/', VersionHandler),  # send back garbage to abort the vite web socket
                (fr'{ path_c }/([-0-9a-z]+)/[0-9]+/res/(.+)', ResourceHandler, {
                    'session': self._session }),
                (fr'{ path_c }/([-0-9a-z]+)/([0-9]+)/module/(.+)',
                    ModuleAssetHandler, { 'session': self._session }),
                (fr'{ path_c }/[a-f0-9-]+/[0-9]+/(.*)', ForwardHandler, {
                    'base_url': self._dev_server, 'default_filename': 'resultsview.html' }),
                (fr'{ path_c }/(.*)', ForwardHandler, {
                    'base_url': self._dev_server }),
            ])

        else:
            analysisui_path = os.path.join(client_path, 'analysisui.html')
            self._analysisui_app.add_handlers(match_b, [
                (fr'{ path_b }/[-0-9a-f]+/', SingleFileHandler, {
                    'path': analysisui_path,
                    'extra_headers': cache_headers }),
                (fr'{ path_b }/assets/([-.0-9a-zA-Z]+)', StaticFileHandler, {
                    'path': assets_path }),
                (fr'{ path_b }/([-.0-9a-zA-Z]+)', StaticFileHandler, {
                    'path': client_path,
                    'extra_headers': cache_headers }),
            ])

            resultsview_path = os.path.join(client_path, 'resultsview.html')
            self._resultsview_app.add_handlers(match_c, [
                (fr'{ path_c }/[-0-9a-z]+/[0-9]+/', SingleFileHandler, {
                    'path': resultsview_path,
                    'extra_headers': cache_headers }),
                (fr'{ path_c }/assets/([-.0-9a-zA-Z]+)', StaticFileHandler, {
                    'path': assets_path }),
                (fr'{ path_c }/([-.0-9a-zA-Z]+)', StaticFileHandler, {
                    'path': client_path,
                    'extra_headers': cache_headers }),
                (fr'{ path_c }/([-0-9a-z]+)/[0-9]+/res/(.+)', ResourceHandler, {
                    'session': self._session }),
                (fr'{ path_c }/([-0-9a-z]+)/([0-9]+)/module/(.+)',
                    ModuleAssetHandler, { 'session': self._session }),
            ])

        sockets = tornado.netutil.bind_sockets(port_a, self._host)
        server = tornado.httpserver.HTTPServer(self._main_app)
        server.add_sockets(sockets)
        port_a = sockets[0].getsockname()[1]

        if separate_by == 'port':
            sockets = tornado.netutil.bind_sockets(port_b, self._host)
            server = tornado.httpserver.HTTPServer(self._analysisui_app)
            server.add_sockets(sockets)
            port_b = sockets[0].getsockname()[1]

            sockets = tornado.netutil.bind_sockets(port_c, self._host)
            server = tornado.httpserver.HTTPServer(self._resultsview_app)
            server.add_sockets(sockets)
            port_c = sockets[0].getsockname()[1]
        else:
            port_c = port_b = port_a

        if host_a is not None:
            if separate_by == 'port':
                hosts = f'{ host_a }:{ port_a } { host_b }:{ port_b } { host_c }:{ port_c }'
                roots[:] = (f'{ host_a }:{ port_a }', f'{ host_b }:{ port_b }', f'{ host_c }:{ port_c }')
            elif separate_by == 'path':
                if port_a != 80:
                    hosts = f'{ host_a }:{ port_a }'
                    roots[:] = (f'{ host_a }:{ port_a }{ path_a }', f'{ host_b }:{ port_b }{ path_b }', f'{ host_c }:{ port_c }{ path_c }')
                else:
                    hosts = f'{ host_a }'
                    roots[:] = (f'{ host_a }{ path_a }', f'{ host_b }{ path_b }', f'{ host_c }{ path_c }')
            else:  # separate_by == 'host':
                if port_a != 80:
                    hosts = f'{ host_a }:{ port_a } { host_b }:{ port_b } { host_c }:{ port_c }'
                    roots[:] = (f'{ host_a }:{ port_a }', f'{ host_b }:{ port_b }', f'{ host_c }:{ port_c }')
                else:
                    hosts = f'{ host_a } { host_b } { host_c }'
                    roots[:] = (host_a, host_b, host_c)

            # now we have the port numbers, we can add CSP
            cache_headers[ 'Content-Security-Policy' ] = f'''
                default-src 'self';
                font-src 'self' data:;
                img-src 'self' data:;
                script-src  'self' 'unsafe-eval' 'unsafe-inline';
                style-src 'self' 'unsafe-inline';
                frame-src 'self' { hosts } https://www.jamovi.org;
            '''.replace('\n', '')

            log.info(f'listening across origin(s): { hosts }')
            if access_key_generated:
                log.info(f'jamovi accessible from: { roots[0] }/?access_key={ access_key }')

        self.ports_opened.set_result((port_a, port_b, port_c, access_key))

        # write the port no. to a file, so external software can
        # find out what port jamovi is running on
        app_data = Dirs.app_data_dir()
        port_name = f'{ port_a }.port'
        self._port_file = os.path.join(app_data, port_name)
        with open(self._port_file, 'w'):
            pass

        for entry in os.scandir(app_data):
            if entry.name == port_name:
                continue
            if entry.name.endswith('.port') and entry.is_file():
                os.remove(entry.path)

        try:
            await self._session.wait_ended()
        finally:
            try:
                os.remove(self._port_file)
            except Exception:
                pass

            rmtree(session_path, ignore_errors=True)

    def _session_event(self, event):
        if event.type == SessionEvent.Type.INSTANCE_STARTED:
            sys.stdout.write('%s %s\n' % ('instance_started', event.instance_id))
            sys.stdout.flush()
        elif event.type == SessionEvent.Type.INSTANCE_ENDED:
            sys.stdout.write('%s %s\n' % ('instance_ended', event.instance_id))
            sys.stdout.flush()
