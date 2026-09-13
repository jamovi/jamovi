
import os
import mimetypes

import aiohttp
from aiohttp import web

# Headers not safe to forward between proxy and upstream
_HOP_BY_HOP = frozenset({
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade',
})


async def forward_handler(
    request: web.Request,
    base_url: str,
    default_filename: str = 'index.html',
) -> web.StreamResponse:

    path = request.match_info.get('path', '')

    if not path:
        path = f'/{default_filename}'
    elif path.endswith('/'):
        path = f'{path}{default_filename}'
    elif not path.startswith('/'):
        path = f'/{path}'

    url = f'{base_url}{path}'
    if request.query_string:
        url = f'{url}?{request.query_string}'

    forward_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP and k.lower() != 'host'
    }

    resp = web.StreamResponse()

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=forward_headers) as upstream:
            resp.set_status(upstream.status)
            for key, value in upstream.headers.items():
                if key.lower() not in _HOP_BY_HOP:
                    resp.headers[key] = value
            await resp.prepare(request)
            async for chunk in upstream.content.iter_chunked(64 * 1024):
                await resp.write(chunk)

    await resp.write_eof()
    return resp


# Generic handler factories (no session dependency)

def make_single_file_handler(path: str, mime_type: str | None = None,
                             extra_headers: dict | None = None):
    async def handler(_: web.Request) -> web.Response:
        ct = mime_type or mimetypes.guess_type(path)[0] or 'application/octet-stream'
        with open(path, 'rb') as f:
            body = f.read()
        return web.Response(body=body, content_type=ct,
                            headers=dict(extra_headers) if extra_headers else {})
    return handler


def make_static_dir_handler(directory: str, extra_headers: dict | None = None,
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


def make_forward(base_url: str, default_filename: str = 'index.html'):
    async def handler(request: web.Request) -> web.StreamResponse:
        return await forward_handler(request, base_url=base_url,
                                     default_filename=default_filename)
    return handler


def make_host_dispatch_middleware(apps_by_host: dict):
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
