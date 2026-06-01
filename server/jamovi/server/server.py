
import sys
import os
import uuid
import mimetypes
import re
import json
import logging
import threading
import asyncio
from asyncio import create_task
from urllib.parse import urlparse
from tempfile import NamedTemporaryFile, TemporaryDirectory
from shutil import rmtree

from aiohttp import web

from .clientconnection import client_connection_handler
from .session import Session
from .utils import conf
from .appinfo import app_info
from jamovi.core import Dirs
from .i18n import _
from .webhandlers import forward_handler
from .exceptions import FileExistsException, UserException

log = logging.getLogger(__name__)


access_key = conf.get('access_key', None)
access_key_generated = False

if access_key is None:
    access_key = uuid.uuid4().hex
    access_key_generated = True
    conf.set('access_key', access_key)


# Generic static-file helpers (no session dependency)

def _make_single_file_handler(path: str, mime_type: str | None = None,
                               extra_headers: dict | None = None):
    async def handler(_: web.Request) -> web.Response:
        ct = mime_type or mimetypes.guess_type(path)[0] or 'application/octet-stream'
        with open(path, 'rb') as f:
            body = f.read()
        return web.Response(body=body, content_type=ct,
                            headers=dict(extra_headers) if extra_headers else {})
    return handler


def _make_static_dir_handler(directory: str, extra_headers: dict | None = None,
                              default_filename: str | None = None):
    _real = os.path.realpath(directory)

    async def handler(request: web.Request) -> web.Response:
        rel = request.match_info.get('path', '')
        if not rel:
            if default_filename:
                rel = default_filename
            else:
                raise web.HTTPNotFound()
        filepath = os.path.realpath(os.path.join(_real, rel))
        if not filepath.startswith(_real):
            raise web.HTTPForbidden()
        if not os.path.isfile(filepath):
            raise web.HTTPNotFound()
        ct, enc = mimetypes.guess_type(filepath)
        headers = dict(extra_headers) if extra_headers else {}
        if enc:
            headers['Content-Encoding'] = enc
        with open(filepath, 'rb') as f:
            body = f.read()
        return web.Response(body=body, content_type=ct or 'application/octet-stream',
                            headers=headers)
    return handler


def _make_forward(base_url: str, default_filename: str = 'index.html'):
    async def handler(request: web.Request) -> web.StreamResponse:
        return await forward_handler(request, base_url=base_url,
                                     default_filename=default_filename)
    return handler


def _make_host_dispatch_middleware(apps_by_host: dict):
    @web.middleware
    async def dispatch(request: web.Request, handler):
        host = request.headers.get('Host', '').split(':')[0]
        target = apps_by_host.get(host)
        if target is not None:
            match_info = await target.router.resolve(request)
            request._match_info = match_info
            return await match_info.handler(request)
        return await handler(request)
    return dispatch


# Route handler class

class _Handlers:
    """All aiohttp route handlers, grouped by the session and config they share."""

    def __init__(self, session, client_path: str, assets_path: str, i18n_path: str,
                 dev_server: str | None, cache_headers: dict, server):
        self._session = session
        self._client_path = client_path
        self._assets_path = assets_path
        self._i18n_path = i18n_path
        self._dev_server = dev_server
        self._cache_headers = cache_headers
        self._server = server  # for _pdfify and _roots
        self._i18n_manifest_cache: dict = {}
        self._download_real_path = os.path.realpath(session.session_path)

    # -- auth -----------------------------------------------------------------

    def _auth_error(self, request: web.Request) -> web.Response | None:
        key_required = conf.get('access_key', '')
        if not key_required:
            return None
        key_provided = request.cookies.get('access_key')
        if key_provided is None:
            return web.Response(content_type='text/plain',
                text=f'{{"status":"error","message":{json.dumps(_("Authentication required"))}}}\n')
        if key_provided != key_required:
            return web.Response(content_type='text/plain',
                text=f'{{"status":"error","message":{json.dumps(_("Authentication failure"))}}}\n')
        return None

    # -- simple ---------------------------------------------------------------

    async def version(self, _: web.Request) -> web.Response:
        return web.Response(text=app_info.version)

    async def config_js(self, _: web.Request) -> web.Response:
        r = self._server._roots
        js = f'window.config = {{"client":{{"roots":["{r[0]}","{r[1]}","{r[2]}"]}}}}'
        return web.Response(text=js, content_type='application/javascript')

    async def datasets(self, _: web.Request) -> web.Response:
        rows = [
            {
                'id': id,
                'title': inst._data.title,
                'buffer': inst._buffer_path,
                'rowCount': inst._data.row_count,
                'columnCount': inst._data.column_count,
            }
            for id, inst in self._session.items()
        ]
        return web.Response(text=json.dumps(rows), content_type='application/json',
            headers={'Cache-Control': 'private, no-store, must-revalidate, max-age=0'})

    async def settings(self, request: web.Request) -> web.Response:
        self._session.apply_settings(json.loads((await request.read()).decode('utf-8')))
        return web.Response(status=200)

    async def end(self, _: web.Request) -> web.Response:
        self._session.stop()
        return web.Response(status=200)

    # -- open / save ----------------------------------------------------------

    async def entry(self, request: web.Request) -> web.Response:
        required_key = conf.get('access_key', '')
        if required_key:
            provided_key = request.rel_url.query.get('access_key')
            if provided_key is None:
                return web.Response(status=401, content_type='text/html',
                    text='<h1>access key required</h1>'
                         '<p>You must append ?access_key=... onto your URL</p>')
            if provided_key != required_key:
                return web.Response(status=401, content_type='text/html',
                    text='<h1>auth failed</h1><p>provided access key is not correct</p>')

        instance = await self._session.create()
        query = f'?{request.query_string}' if request.query_string else ''
        exc = web.HTTPFound(location=f'{instance.id}/{query}')
        if required_key:
            exc.set_cookie('access_key', provided_key)
        raise exc

    async def open_get(self, request: web.Request) -> web.Response:
        err = self._auth_error(request)
        if err is not None:
            return err

        instance_id = request.match_info.get('instance_id')
        instance = None
        url = request.rel_url.query.get('url', '')
        self._session.set_language(request.headers.get('Accept-Language', 'en'))

        if instance_id:
            instance = self._session.get(instance_id)
            if instance is None:
                return web.Response(content_type='text/plain',
                    text=f'{{"status":"terminated",'
                         f'"message":{json.dumps(_("This data set is no longer available"))}}}')
            if url == '' and instance._data.has_dataset:
                return web.Response(status=204)

        title = request.rel_url.query.get('title')
        is_temp = 'temp' in request.rel_url.query
        ext = None
        filename = request.rel_url.query.get('filename')
        if filename:
            name, dot_ext = os.path.splitext(filename)
            if dot_ext:
                ext = dot_ext[1:].lower()
            if title is None:
                title = name

        parts = []
        try:
            if instance is None:
                instance = await self._session.create()
            async for progress in instance.open(url, title, is_temp, ext):
                p, n = progress
                parts.append(f'{{"status":"in-progress","p":{p},"n":{n}}}\n')
        except Exception as e:
            log.exception(e)
            message = str(e) or type(e).__name__
            parts.append(f'{{"status":"error","message":{json.dumps(message)}}}\n')
        else:
            parts.append(f'{{"status":"OK","url":"{instance.id}/"}}\n')

        return web.Response(content_type='text/plain', text=''.join(parts))

    async def open_post(self, request: web.Request) -> web.StreamResponse:
        err = self._auth_error(request)
        if err is not None:
            return err

        options: dict = {}
        data = await request.post()
        options_raw = data.get('options', '{}')
        if isinstance(options_raw, str):
            try:
                options_dict = json.loads(options_raw)
                if isinstance(options_dict, dict):
                    options = options_dict
            except ValueError:
                pass

        file_path: str
        file_title = None
        file_ext = None
        is_temp = False

        if 'file' in data:
            ff = data['file']
            if not isinstance(ff, web.FileField):
                return web.Response(status=400, text='400: Bad Request')
            file_title, dot_ext = os.path.splitext(ff.filename)
            with NamedTemporaryFile(suffix=dot_ext, delete=False) as tmp:
                tmp.write(ff.file.read())
            file_path = tmp.name
            is_temp = True
        elif 'path' in options:
            file_path = options['path']
            is_temp = options.get('temp', False) is not False
            file_title = options.get('title')
            file_ext = options.get('ext')
        elif 'file.path' in data:
            raw_path = data['file.path']
            raw_name = data['file.name']
            if not isinstance(raw_path, str) or not isinstance(raw_name, str):
                return web.Response(status=400, text='400: Bad Request')
            file_path = raw_path
            file_title, dot_ext = os.path.splitext(raw_name)
            file_ext = dot_ext[1:] if dot_ext else None
            is_temp = True
        else:
            return web.Response(status=400, text='400: Bad Request')

        self._session.set_language(request.headers.get('Accept-Language', 'en'))

        resp = web.StreamResponse(headers={'Content-Type': 'text/plain'})
        await resp.prepare(request)
        try:
            instance = await self._session.create()
            async for progress in instance.open(
                file_path, title=file_title, is_temp=is_temp,
                ext=file_ext, options=options,
            ):
                p, n = progress
                await resp.write(f'{{"status":"in-progress","p":{p},"n":{n}}}\n'.encode())
        except Exception as e:
            log.exception(e)
            message = str(e) or type(e).__name__
            await resp.write(f'{{"status":"error","message":{json.dumps(message)}}}\n'.encode())
        else:
            await resp.write(f'{{"status":"OK","url":"{instance.id}/"}}\n'.encode())
        await resp.write_eof()
        return resp

    async def save(self, request: web.Request) -> web.StreamResponse:
        instance_id = request.match_info['instance_id']
        instance = self._session.get(instance_id)
        if instance is None:
            return web.Response(status=404, text='404: Not Found')

        options: dict = {}
        data = await request.post()
        options_raw = data.get('options', '{}')
        if isinstance(options_raw, str):
            try:
                options_dict = json.loads(options_raw)
                if isinstance(options_dict, dict):
                    options = options_dict
            except ValueError:
                pass

        if 'content' in data:
            field = data['content']
            if isinstance(field, web.FileField):
                options['content'] = field.file.read()
            elif isinstance(field, str):
                options['content'] = field

        resp = web.StreamResponse(headers={'Content-Type': 'text/plain'})
        await resp.prepare(request)

        result: dict
        try:
            stream = instance.save(options)
            async for progress in stream:
                p, n = progress
                await resp.write(f'{{"status":"in-progress","p":{p},"n":{n}}}\n'.encode())
            result = {'status': 'OK'}
            result.update(await stream)
        except FileExistsException:
            result = {'status': 'error', 'code': 'file-exists'}
        except UserException as e:
            result = {'status': 'error', 'message': e.cause}

        await resp.write(json.dumps(result).encode())
        await resp.write_eof()
        return resp

    # -- resources / modules --------------------------------------------------

    async def resource(self, request: web.Request) -> web.Response:
        instance_id = request.match_info['instance_id']
        resource_id = request.match_info['resource_id']
        instance = self._session.get(instance_id)
        if instance is None:
            return web.Response(status=404, content_type='text/html',
                text=f'<h1>404</h1>instance {instance_id} could not be found')

        ct, enc = mimetypes.guess_type(resource_id)
        headers = {}
        if enc:
            headers['Content-Encoding'] = enc

        if conf.get('xaccel_use', '0') != '0':
            xaccel_root = conf.get('xaccel_root')
            headers['X-Accel-Redirect'] = f'/{xaccel_root}/{instance_id}/{resource_id}'
            return web.Response(content_type=ct or 'application/octet-stream', headers=headers)

        resource_path = instance.get_path_to_resource(resource_id)
        headers['Cache-Control'] = 'private, no-cache, must-revalidate, max-age=0'
        with open(resource_path, 'rb') as f:
            body = f.read()
        return web.Response(body=body, content_type=ct or 'application/octet-stream',
                            headers=headers)

    async def module_asset(self, request: web.Request) -> web.Response:
        instance_id = request.match_info['instance_id']
        analysis_id = request.match_info['analysis_id']
        path = request.match_info['path']
        instance = self._session.get(instance_id)
        if instance is None:
            return web.Response(status=404, content_type='text/html',
                text=f'<h1>404</h1>instance {instance_id} could not be found')

        analysis = instance.analyses.get(int(analysis_id))
        module_name = analysis.ns
        module_path = self._session.modules.get(module_name).path
        asset_path = os.path.join(module_path, 'R', analysis.ns, path)

        if not asset_path.startswith(module_path):
            return web.Response(status=403, content_type='text/html', text='<h1>403</h1>verboten')

        ct, enc = mimetypes.guess_type(asset_path)
        headers = {'Cache-Control': 'private, no-cache, must-revalidate, max-age=0'}
        if enc:
            headers['Content-Encoding'] = enc
        with open(asset_path, 'rb') as f:
            body = f.read()
        return web.Response(body=body, content_type=ct or 'application/octet-stream',
                            headers=headers)

    async def module_i18n(self, request: web.Request) -> web.Response:
        module_name = request.match_info['module_name']
        code = request.match_info['code']
        try:
            module_path = self._session.modules.get(module_name).path
            defn_path = os.path.join(module_path, 'R', module_name, 'i18n', f'{code}.json')
            with open(defn_path, 'rb') as f:
                body = f.read()
        except (KeyError, FileNotFoundError) as e:
            return web.Response(status=404, content_type='text/html', text=f'<h1>404</h1>{e}')
        return web.Response(body=body, content_type='application/json',
            headers={'Cache-Control': 'private, no-store, must-revalidate, max-age=0'})

    async def module_descriptor(self, request: web.Request) -> web.Response:
        module_name = request.match_info['module_name']
        try:
            module_path = self._session.modules.get(module_name).path
            defn_path = os.path.join(module_path, 'jamovi-full.yaml')
            with open(defn_path, 'rb') as f:
                body = f.read()
        except (KeyError, FileNotFoundError) as e:
            return web.Response(status=404, content_type='text/html', text=f'<h1>404</h1>{e}')
        return web.Response(body=body, content_type='text/yaml')

    async def analysis_descriptor(self, request: web.Request) -> web.Response:
        module_name = request.match_info['module_name']
        analysis_name = request.match_info['analysis_name']
        part = request.match_info.get('part') or 'js'
        try:
            module_path = self._session.modules.get(module_name).path
            if part == 'js':
                path = os.path.join(module_path, 'ui', analysis_name.lower() + '.' + part)
            else:
                path = os.path.join(module_path, 'analyses', analysis_name.lower() + '.' + part)
            path = os.path.realpath(path)
            with open(path, 'rb') as f:
                body = f.read()
        except (KeyError, FileNotFoundError) as e:
            return web.Response(status=404, content_type='text/html', text=f'<h1>404</h1>{e}')
        return web.Response(body=body, content_type='text/plain')

    async def pdf(self, request: web.Request) -> web.Response:
        body = await request.read()
        with NamedTemporaryFile(suffix='.html', delete=False) as f:
            f.write(body)
            html_path = f.name
        try:
            pdf_path = await self._server._pdfify(html_path)
            with open(pdf_path, 'rb') as f:
                content = f.read()
            return web.Response(body=content, content_type='application/pdf')
        except Exception as e:
            return web.Response(status=500, text=str(e))
        finally:
            try:
                os.remove(html_path)
            except OSError:
                pass

    async def i18n_manifest(self, _: web.Request) -> web.Response:
        if 'data' not in self._i18n_manifest_cache:
            with open(os.path.join(self._i18n_path, 'manifest.json'), encoding='utf-8') as f:
                self._i18n_manifest_cache['data'] = json.load(f)
        manifest = self._i18n_manifest_cache['data']
        current = self._session.get_language()
        if current:
            manifest = dict(manifest)
            manifest['current'] = current
        return web.Response(text=json.dumps(manifest), content_type='application/json')

    async def download(self, request: web.Request) -> web.Response:
        path = request.match_info['path']
        filepath = os.path.realpath(os.path.join(self._download_real_path, path))
        if not filepath.startswith(self._download_real_path):
            raise web.HTTPForbidden()
        if not os.path.isfile(filepath):
            raise web.HTTPNotFound()
        ct, enc = mimetypes.guess_type(filepath)
        headers = {}
        filename_param = request.rel_url.query.get('filename')
        if filename_param:
            headers['Content-Disposition'] = f'attachment; filename="{filename_param}"'
        if enc:
            headers['Content-Encoding'] = enc
        with open(filepath, 'rb') as f:
            body = f.read()
        return web.Response(body=body, content_type=ct or 'application/octet-stream',
                            headers=headers)

    async def websocket(self, request: web.Request) -> web.WebSocketResponse:
        return await client_connection_handler(request, self._session)

    # -- route registration ---------------------------------------------------

    def add_main_routes(self, router: web.UrlDispatcher):
        ch = self._cache_headers
        cp = self._client_path
        ap = self._assets_path
        ds = self._dev_server

        router.add_get('/', self.entry)
        router.add_get('/config.js', self.config_js)
        router.add_get('/open', self.open_get)
        router.add_post('/open', self.open_post)
        router.add_post('/settings', self.settings)
        router.add_post('/end', self.end)
        router.add_get('/version', self.version)
        router.add_get(r'/{instance_id:[a-f0-9-]+}/open', self.open_get)
        router.add_post(r'/{instance_id:[a-f0-9-]+}/open', self.open_post)
        router.add_post(r'/{instance_id:[a-f0-9-]+}/save', self.save)
        router.add_get(r'/{instance_id:[a-f0-9-]+}/coms', self.websocket)
        router.add_get(r'/{path:[a-f0-9-]+/dl/.+}', self.download)
        router.add_get(r'/modules/{module_name:[0-9a-zA-Z]+}', self.module_descriptor)
        router.add_get(
            r'/modules/{module_name:[0-9a-zA-Z]+}/i18n/{code:.+}',
            self.module_i18n)
        router.add_get(
            r'/analyses/{module_name:[0-9a-zA-Z]+}/{analysis_name:[0-9a-zA-Z]+}/{part:[.0-9a-zA-Z]+}',
            self.analysis_descriptor)
        router.add_get(
            r'/analyses/{module_name:[0-9a-zA-Z]+}/{analysis_name:[0-9a-zA-Z]+}',
            self.analysis_descriptor)
        router.add_post('/utils/to-pdf', self.pdf)
        router.add_get('/api/datasets', self.datasets)
        router.add_get('/i18n/', self.i18n_manifest)
        router.add_get(r'/i18n/{path:.+}', _make_static_dir_handler(self._i18n_path))

        if ds:
            router.add_get(r'/{instance_id:[a-f0-9-]+}/{path:.*}', _make_forward(ds))
            router.add_get(r'/{path:.*}', _make_forward(ds))
        else:
            router.add_get(r'/assets/{path:.+}', _make_static_dir_handler(ap, ch))
            router.add_get(r'/{instance_id:[a-f0-9-]+}/',
                _make_single_file_handler(os.path.join(cp, 'index.html'), 'text/html', ch))
            router.add_get(r'/{path:[-0-9a-z.]*}', _make_static_dir_handler(cp, ch))

    def add_analysisui_routes(self, router: web.UrlDispatcher):
        ch = self._cache_headers
        cp = self._client_path
        ap = self._assets_path
        ds = self._dev_server

        if ds:
            router.add_get('/', self.version)
            router.add_get(r'/{instance_id:[a-f0-9-]+}/{path:.*}',
                _make_forward(ds, 'analysisui.html'))
            router.add_get(r'/{path:.*}', _make_forward(ds))
        else:
            analysisui_path = os.path.join(cp, 'analysisui.html')
            router.add_get(r'/{instance_id:[-0-9a-f]+}/',
                _make_single_file_handler(analysisui_path, 'text/html', ch))
            router.add_get(r'/assets/{path:.+}', _make_static_dir_handler(ap, ch))
            router.add_get(r'/{path:[-.0-9a-zA-Z]+}', _make_static_dir_handler(cp, ch))

    def add_resultsview_routes(self, router: web.UrlDispatcher):
        ch = self._cache_headers
        cp = self._client_path
        ap = self._assets_path
        ds = self._dev_server

        if ds:
            router.add_get('/', self.version)
            router.add_get(
                r'/{instance_id:[-0-9a-z]+}/{analysis_id:[0-9]+}/res/{resource_id:.+}',
                self.resource)
            router.add_get(
                r'/{instance_id:[-0-9a-z]+}/{analysis_id:[0-9]+}/module/{path:.+}',
                self.module_asset)
            router.add_get(r'/{instance_id:[a-f0-9-]+}/{analysis_id:[0-9]+}/{path:.*}',
                _make_forward(ds, 'resultsview.html'))
            router.add_get(r'/{path:.*}', _make_forward(ds))
        else:
            resultsview_path = os.path.join(cp, 'resultsview.html')
            router.add_get(r'/{instance_id:[-0-9a-z]+}/{analysis_id:[0-9]+}/',
                _make_single_file_handler(resultsview_path, 'text/html', ch))
            router.add_get(r'/assets/{path:.+}', _make_static_dir_handler(ap, ch))
            router.add_get(r'/{path:[-.0-9a-zA-Z]+}', _make_static_dir_handler(cp, ch))
            router.add_get(
                r'/{instance_id:[-0-9a-z]+}/{analysis_id:[0-9]+}/res/{resource_id:.+}',
                self.resource)
            router.add_get(
                r'/{instance_id:[-0-9a-z]+}/{analysis_id:[0-9]+}/module/{path:.+}',
                self.module_asset)


# Server

class Server:

    ETRON_RESP_REGEX = re.compile(r'^response: ([a-z-]+) \(([0-9]+)\) ([10]) ?"(.*)"\n?$')
    ETRON_NOTF_REGEX = re.compile(r'^notification: ([a-z-]+) ?(.*)\n?$')

    def __init__(self, bind_host='127.0.0.1', session_id=None,
                 stdin_slave=False, debug=False, dev_server=None):

        mimetypes.add_type('text/html', '.html')
        mimetypes.add_type('application/javascript', '.js')
        mimetypes.add_type('text/css', '.css')
        mimetypes.add_type('image/svg+xml', '.svg')
        mimetypes.add_type('text/protobuf', '.proto')
        mimetypes.add_type('application/json', '.json')
        mimetypes.add_type('font/woff', '.woff')

        self._session = None
        self._session_id = session_id if session_id is not None else str(uuid.uuid4())
        self._ioloop = asyncio.get_event_loop()
        self._host = bind_host
        self._stdin_slave = stdin_slave
        self._debug = debug
        self._dev_server = dev_server
        self._roots: list = []

        self.ports_opened = self._ioloop.create_future()

        self._spool_path = conf.get('spool_path')
        if self._spool_path is None:
            self._spool = TemporaryDirectory()
            self._spool_path = os.path.realpath(self._spool.name)

        if stdin_slave:
            self._thread = threading.Thread(target=self._read_stdin)
            self._thread.daemon = True
            self._thread.start()

        self._etron_reqs: list = []
        self._etron_req_id = 0
        self._port_file = None

    def _set_update_status(self, status):
        self._request({'cmd': 'software-update', 'args': [status]})

    def _request(self, request):
        request['id'] = str(self._etron_req_id)
        self._etron_req_id += 1
        self._etron_reqs.append(request)
        sys.stdout.write(f'request: {request["cmd"]} ({request["id"]}) "{request["args"][0]}"\n')
        sys.stdout.flush()

    def _pdfify(self, html_path: str) -> asyncio.Future:
        future = self._ioloop.create_future()
        self._request({'cmd': 'convert-to-pdf', 'args': [html_path], 'waiting': future})
        return future

    def _read_stdin(self):
        try:
            for line in sys.stdin:
                asyncio.run_coroutine_threadsafe(
                    self._process_stdin(line.strip()), self._ioloop)
        except OSError:
            pass
        self._ioloop.call_soon_threadsafe(self.stop)

    async def _process_stdin(self, line):
        match = Server.ETRON_RESP_REGEX.match(line)
        if match:
            req_id = match.group(2)
            for request in self._etron_reqs:
                if request['id'] == req_id:
                    if match.group(3) == '1':
                        request['waiting'].set_result(match.group(4))
                    else:
                        request['waiting'].set_exception(RuntimeError(match.group(4)))
                    self._etron_reqs.remove(request)
                    return

        match = Server.ETRON_NOTF_REGEX.match(line)
        if match:
            if match.group(1) == 'update':
                self._session.set_update_status(match.group(2))
            return

        if line.startswith('install: ') or line.startswith('install-and-quit: '):
            if line.startswith('install: '):
                path, quit_after = line[9:], False
            else:
                path, quit_after = line[18:], True
            try:
                await self._session.restart_engines()
                await self._session.modules.install_from_file(path, update=True)
                self._session.notify_global_changes()
            except Exception:
                import traceback
                print(traceback.format_exc())
            if quit_after:
                self.stop()
        else:
            sys.stderr.write(line)
            sys.stderr.flush()

    def stop(self):
        if self._session is not None:
            self._session.stop()

    def start(self):
        create_task(self._run())

    async def wait_ended(self):
        if self._session is not None:
            await self._session.wait_ended()

    async def _run(self):
        client_path = conf.get('client_path')
        i18n_path = conf.get('i18n_path') or os.path.join(conf.get('home'), 'i18n', 'json')

        session_path = os.path.join(self._spool_path, self._session_id)
        os.makedirs(session_path)

        self._session = Session(self._spool_path, self._session_id)
        self._session.set_update_request_handler(self._set_update_status)
        await self._session.start()

        assets_path = os.path.join(client_path, 'assets')
        cache_headers: dict = (
            {'Cache-Control': 'private, no-cache, must-revalidate, max-age=0'}
            if conf.get('devel', False)
            else {'Cache-Control': 'private, max-age=60'}
        )

        host = conf.get('hostname', '127.0.0.1')
        host_a = conf.get('host_a', host)
        host_b = conf.get('host_b',
            host_a if re.match(r'[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+', host) else f'a.{host_a}')
        host_c = conf.get('host_c',
            host_a if re.match(r'[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+', host) else f'r.{host_a}')

        parsed_a = urlparse(f'//{host_a}')
        parsed_b = urlparse(f'//{host_b}')
        parsed_c = urlparse(f'//{host_c}')

        path_a = parsed_a.path.rstrip('/')
        path_b = parsed_b.path.rstrip('/')
        path_c = parsed_c.path.rstrip('/')

        port_a = parsed_a.port or 0
        port_b = parsed_b.port or 0
        port_c = parsed_c.port or 0

        host_a = parsed_a.hostname
        host_b = parsed_b.hostname
        host_c = parsed_c.hostname

        if host_a != host_b and host_b != host_c:
            separate_by = 'host'
        elif path_a != path_b and path_b != path_c:
            separate_by = 'path'
            if port_a == 0:
                port_a = 80
        elif port_a == 0 and port_b == 0 and port_c == 0:
            separate_by = 'port'
        elif port_a != port_b and port_b != port_c:
            separate_by = 'port'
        else:
            raise ValueError('cannot determine separation mode for hosts/ports')

        handlers = _Handlers(self._session, client_path, assets_path, i18n_path,
                             self._dev_server, cache_headers, self)

        main_app = web.Application()
        handlers.add_main_routes(main_app.router)

        try:
            from .extras import get_extra_handlers
            for h_path, handler in get_extra_handlers(self._session):
                main_app.router.add_route('*', h_path, handler)
        except ImportError:
            pass

        analysisui_app = web.Application()
        handlers.add_analysisui_routes(analysisui_app.router)

        resultsview_app = web.Application()
        handlers.add_resultsview_routes(resultsview_app.router)

        runners: list[web.AppRunner] = []

        if separate_by == 'port':
            for app, p in ((main_app, port_a), (analysisui_app, port_b),
                           (resultsview_app, port_c)):
                r = web.AppRunner(app)
                await r.setup()
                runners.append(r)
                await web.TCPSite(r, self._host, p).start()
            port_a = int(runners[0].addresses[0][1])
            port_b = int(runners[1].addresses[0][1])
            port_c = int(runners[2].addresses[0][1])

        elif separate_by == 'path':
            root_app = web.Application()
            root_app.add_subapp(path_a + '/', main_app)
            root_app.add_subapp(path_b + '/', analysisui_app)
            root_app.add_subapp(path_c + '/', resultsview_app)
            runner = web.AppRunner(root_app)
            await runner.setup()
            runners.append(runner)
            await web.TCPSite(runner, self._host, port_a).start()
            port_a = port_b = port_c = int(runner.addresses[0][1])

        else:  # separate_by == 'host'
            dispatch_app = web.Application(middlewares=[
                _make_host_dispatch_middleware({
                    host_a: main_app,
                    host_b: analysisui_app,
                    host_c: resultsview_app,
                })
            ])
            runner = web.AppRunner(dispatch_app)
            await runner.setup()
            runners.append(runner)
            await web.TCPSite(runner, self._host, port_a).start()
            port_a = port_b = port_c = int(runner.addresses[0][1])

        roots = self._roots
        if host_a is not None:
            if separate_by == 'port':
                hosts = f'{host_a}:{port_a} {host_b}:{port_b} {host_c}:{port_c}'
                roots[:] = (f'{host_a}:{port_a}', f'{host_b}:{port_b}', f'{host_c}:{port_c}')
            elif separate_by == 'path':
                if port_a != 80:
                    hosts = f'{host_a}:{port_a}'
                    roots[:] = (f'{host_a}:{port_a}{path_a}',
                                f'{host_b}:{port_b}{path_b}',
                                f'{host_c}:{port_c}{path_c}')
                else:
                    hosts = host_a
                    roots[:] = (f'{host_a}{path_a}', f'{host_b}{path_b}', f'{host_c}{path_c}')
            else:  # host
                if port_a != 80:
                    hosts = f'{host_a}:{port_a} {host_b}:{port_b} {host_c}:{port_c}'
                    roots[:] = (f'{host_a}:{port_a}', f'{host_b}:{port_b}', f'{host_c}:{port_c}')
                else:
                    hosts = f'{host_a} {host_b} {host_c}'
                    roots[:] = (host_a, host_b, host_c)

            cache_headers['Content-Security-Policy'] = (
                f"default-src 'self';"
                f" font-src 'self' data:;"
                f" img-src 'self' data:;"
                f" script-src 'self' 'unsafe-eval' 'unsafe-inline';"
                f" style-src 'self' 'unsafe-inline';"
                f" frame-src 'self' {hosts} https://www.jamovi.org;"
                f" connect-src 'self' data:;"
            )

            log.info('listening across origin(s): %s', hosts)
            if access_key_generated:
                log.info('jamovi accessible from: %s/?access_key=%s', roots[0], access_key)

        self.ports_opened.set_result((port_a, port_b, port_c, access_key))

        app_data = Dirs.app_data_dir()
        port_name = f'{port_a}.port'
        self._port_file = os.path.join(app_data, port_name)
        with open(self._port_file, 'w', encoding='utf-8'):
            pass
        for entry in os.scandir(app_data):
            if entry.name != port_name and entry.name.endswith('.port') and entry.is_file():
                os.remove(entry.path)

        try:
            await self._session.wait_ended()
        finally:
            for runner in runners:
                await runner.cleanup()
            try:
                os.remove(self._port_file)
            except OSError:
                pass
            rmtree(session_path, ignore_errors=True)

