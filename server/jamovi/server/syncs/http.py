
from asyncio import create_task
from tempfile import mkstemp
from ssl import SSLContext
from urllib import parse
import os

from typing import BinaryIO

from aiohttp import ClientSession
from aiohttp import ClientResponse

from jamovi.server.utils import ProgressStream
from jamovi.server import formatio


def handles(url: str) -> bool:
    return url.startswith('http://') or url.startswith('https://')


class HttpSyncFileInfo:
    def __init__(self, url, filename, ext, message=None):
        self.url = url
        self.filename = filename
        self.ext = ext
        self.message = message


def filename_from_url(url: str):
    url_pieces = parse.urlsplit(url)
    path = parse.unquote(url_pieces.path)

    filename = os.path.basename(path)
    return filename


class HttpSync:

    url: str
    options: dict
    client: ClientSession
    ssl_context: SSLContext

    def __init__(self,
            url: str,
            options: dict):

        self.url = url
        self.options = { k: v for k, v in options.items() if k != 'overwrite' }

        self._temp_file = None
        self._temp_file_path = None

    def read(self, client: ClientSession, ssl_context: SSLContext) -> ProgressStream:

        self.client = client
        self.ssl_context = ssl_context

        stream = ProgressStream()
        stream.write(0)
        task = create_task(self.aread(stream))
        return stream

    def write(self, client: ClientSession, ssl_context: SSLContext, content: BinaryIO, content_size: int, overwrite: bool = False) -> ProgressStream:

        self.client = client
        self.ssl_context = ssl_context

        stream = ProgressStream()
        stream.write(0)
        task = create_task(self.awrite(content, content_size, overwrite, stream))
        task.add_done_callback(lambda t: t.result())
        return stream

    async def aread(self, stream: ProgressStream):
        try:
            async with self.client.get(self.url, ssl=self.ssl_context) as response:
                await self.read_response(response, stream)
        except BaseException as e:
            stream.set_exception(e)

    async def awrite(self, content: BinaryIO, content_size: int, overwrite: bool, stream: ProgressStream):
        raise NotImplementedError

    async def read_response(self, response: ClientResponse, stream: ProgressStream) -> HttpSyncFileInfo:

        if response.content_disposition and response.content_disposition.filename:
            filename = response.content_disposition.filename
        else:
            filename = filename_from_url(self.url)

        if not formatio.is_supported(filename):
            raise RuntimeError(_('Unrecognised file format'))

        await self.read_into_tempfile(filename, response, stream)

    async def read_into_tempfile(self, filename: str, response: ClientResponse, stream: ProgressStream):

        content_length = response.content_length

        title, dotext = os.path.splitext(filename)
        fd, self._temp_file_path = mkstemp(suffix=dotext)

        try:
            self._temp_file = os.fdopen(fd, 'wb')

            if dotext != '':
                ext = dotext[1:].lower()
            else:
                ext = ''

            p = 0
            n = 1

            if content_length:
                n = content_length

            stream.write(p / n)

            async for data in response.content.iter_any():
                self._temp_file.write(data)
                if content_length:
                    p += len(data)
                    stream.write(p / n)
        finally:
            self._temp_file.close()

        info = HttpSyncFileInfo(self._temp_file_path, filename, ext)
        stream.set_result(info)

    def is_for(self, url):
        return self.url == url

    async def process(self, data):
        pass

    async def save(self, content):
        pass

    def gen_message(self):
        return None

    def get_title(self):
        return ''

    @property
    def read_only(self):
        return True
