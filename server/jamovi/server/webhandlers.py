
from tornado.web import RequestHandler

from tornado.httputil import parse_response_start_line
from tornado.httputil import HTTPHeaders
from tornado.httpclient import AsyncHTTPClient
from tornado.httpclient import HTTPRequest


class ForwardHandler(RequestHandler):

    def initialize(self, base_url: str, default_filename: str = 'index.html'):
        self._base_url = base_url
        self._default_filename = default_filename

    async def get(self, path):

        self._status_sent = False

        def add_header(line):
            if not self._status_sent:
                status = parse_response_start_line(line)
                self.set_status(status.code, status.reason)
                self._status_sent = True
            else:
                try:
                    headers = HTTPHeaders.parse(line)
                    for key in headers:
                        value = headers[key]
                        self.set_header(key, value)
                except Exception:
                    pass

        if not path:
            path = f'/{ self._default_filename }'
        elif path.endswith('/'):
            path = f'{ path }{ self._default_filename }'

        url = f'{ self._base_url }/{ path }'
        if self.request.query:
            url = f'{ url }?{ self.request.query }'

        request = HTTPRequest(
            url=url,
            method='GET',
            headers=self.request.headers,
            header_callback=add_header,
            streaming_callback=self.write)

        await AsyncHTTPClient().fetch(request, raise_error=False)