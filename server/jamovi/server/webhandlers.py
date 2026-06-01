
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
