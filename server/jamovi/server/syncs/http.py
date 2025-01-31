
from asyncio import create_task
from tempfile import mkstemp
from ssl import SSLContext
from urllib import parse
import os
from enum import Enum
from http.cookies import SimpleCookie
from dataclasses import dataclass

from typing import BinaryIO
from typing import Iterable

from aiohttp import ClientSession
from aiohttp import ClientResponse
from aiohttp.client_exceptions import ClientError
from aiohttp.client_exceptions import ClientResponseError

from jamovi.server.utils import ProgressStream
from jamovi.server.i18n import _
from jamovi.server import formatio


import logging

log = logging.getLogger(__name__)


def handles(url: str) -> bool:
    return url.startswith('http://') or url.startswith('https://')


@dataclass
class HttpSyncFileInfo:
    url: str
    filename: str
    ext: str
    message: str | None = None


class Shareable(Enum):
    DISABLED = 0
    READ_ONLY = 1
    READ_WRITE = 2


@dataclass
class ShareInfo:
    url: str
    share_type: Shareable


MESSAGES = {
    0: _('The remote server could not be reached'),
    400: _('The remote server rejected the request'),
    403: _('You do not have appropriate permissions (403)'),
    404: _("The resource doesn't exist, or has moved (404)"),
    500: _('The remote server reported an error'),
}


class HttpSyncException(Exception):
    def __init__(self, err: BaseException | None = None):
        if err is not None:
            self.__context__ = err

    def __str__(self) -> str:
        err = self.__context__
        if isinstance(err, ClientResponseError):
            status = err.status
            message = MESSAGES.get(status)
            if message is None:
                m_status = status // 100 * 100
                message = MESSAGES.get(m_status)
                if message is None:
                    message = _('The remote server sent an unexpected response')
                message = f'{ message } ({ status })'
            return message
        elif isinstance(err, ClientError):
            return MESSAGES[0]
        else:
            return _('An unexpected error occurred')


def filename_from_url(url: str):
    url_pieces = parse.urlsplit(url)
    path = parse.unquote(url_pieces.path)

    filename = os.path.basename(path)
    return filename




class HttpSync:

    _url: str
    _final_url: str
    _filename: str
    _options: dict
    _client: ClientSession
    _ssl_context: SSLContext
    _cookies: SimpleCookie

    def __init__(self,
            url: str,
            options: dict,
            client: ClientSession):

        self._url = url
        self._final_url = url
        self._options = { k: v for k, v in options.items() if k != 'overwrite' }
        self._client = client
        self._cookies = SimpleCookie()

        self._temp_file = None
        self._temp_file_path = None

    def matches(self, url: str) -> bool:
        return self._url == url

    def read(self) -> ProgressStream:
        stream = ProgressStream()
        stream.write(0)
        create_task(self.__read(stream))
        return stream

    def write(self, content: BinaryIO, content_size: int, overwrite: bool = False) -> ProgressStream:
        stream = ProgressStream()
        stream.write(0)
        create_task(self.__write(content, content_size, overwrite, stream))
        return stream

    async def __read(self, stream: ProgressStream) -> None:
        try:
            await self._read(stream)
        except ClientError as e:
            stream.set_exception(HttpSyncException(e))
        except BaseException as e:
            stream.set_exception(e)

    async def _read(self, stream: ProgressStream) -> None:
        async with self._client.get(self._url) as response:
            await self._read_response(response, stream)

    async def __write(self, content: BinaryIO, content_size: int, overwrite: bool, stream: ProgressStream) -> None:
        try:
            await self._write(content, content_size, overwrite, stream)
        except ClientError as e:
            stream.set_exception(HttpSyncException(e))
        except BaseException as e:
            stream.set_exception(e)

    async def _write(self, content: BinaryIO, content_size: int, overwrite: bool, stream: ProgressStream) -> None:
        raise NotImplementedError

    async def _read_response(self, response: ClientResponse, stream: ProgressStream) -> None:
        self._cookies = response.cookies
        self._final_url = str(response.url)

        if response.content_disposition and response.content_disposition.filename:
            self._filename = response.content_disposition.filename
        else:
            self._filename = filename_from_url(self._final_url)

        if not formatio.is_supported(self._filename):
            raise ValueError(_('Unrecognised file format'))

        await self._read_into_tempfile(self._filename, response, stream)

    async def _read_into_tempfile(self, filename: str, response: ClientResponse, stream: ProgressStream) -> None:

        content_length = response.content_length

        _, dotext = os.path.splitext(filename)
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
            if self._temp_file is not None:
                self._temp_file.close()

        info = HttpSyncFileInfo(self._temp_file_path, filename, ext)
        stream.set_result(info)

    @property
    def shareable(self) -> Iterable[Shareable]:
        return (Shareable.READ_ONLY, )

    async def share(self) -> ShareInfo:
        return ShareInfo(self._url, Shareable.READ_ONLY)

    @property
    def read_only(self) -> bool:
        return True
