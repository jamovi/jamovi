
import ssl
from asyncio import create_task
from functools import partial
from tempfile import TemporaryFile

import aiohttp
import certifi

from .utils.stream import ProgressStream
from .i18n import _


class DownloadError(Exception):
    def __init__(self, message=None):
        if message is None:
            message = _('Unable to reach the library')
        super().__init__(message)


class NoNetworkError(DownloadError):
    def __init__(self, message=None):
        if message is None:
            message = _('No internet connection')
        super().__init__(message)


class CaptivePortalError(DownloadError):
    def __init__(self, message=None):
        if message is None:
            message = _('Unable to access the internet (likely due to a captive portal)')
        super().__init__(message)


class _DownloadInfo:
    def __init__(self, file, stream):
        self.progress = 0
        self.size = -1
        self.file = file
        self.stream = stream


class Download:
    def __init__(self):
        self._ssl_context = ssl.create_default_context(cafile=certifi.where())

    def download(self, url, io=None):
        info = _DownloadInfo(io, ProgressStream())
        info.stream.write((0, 1))
        task = create_task(self._download(url, info))
        task.add_done_callback(partial(self._complete, info))
        return info.stream

    def _complete(self, info, result):
        try:
            result.result()
        except Exception as e:
            info.stream.set_exception(e)

    async def _download(self, url, info):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    ssl=self._ssl_context,
                    timeout=aiohttp.ClientTimeout(total=24 * 60 * 60),
                ) as response:
                    response.raise_for_status()
                    content_length = response.headers.get('Content-Length')
                    if content_length is not None:
                        info.size = int(content_length)
                    async for chunk in response.content.iter_chunked(64 * 1024):
                        if info.file is None:
                            info.file = TemporaryFile()
                        info.file.write(chunk)
                        info.progress += len(chunk)
                        info.stream.write((info.progress, info.size))
            if info.file is not None:
                info.file.flush()
                info.file.seek(0)
            info.stream.set_result(info.file)
        except aiohttp.ClientSSLError as e:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        'http://clients3.google.com/generate_204'
                    ) as response:
                        if response.status != 204:
                            raise CaptivePortalError from e
                        else:
                            raise DownloadError from e
            except (aiohttp.ClientConnectorError, OSError):
                raise NoNetworkError from e
        except (aiohttp.ClientConnectorError, OSError):
            raise NoNetworkError


class Downloader:
    @staticmethod
    def download(url):
        dl = Download()
        return dl.download(url)

    @staticmethod
    def download_to(url, stream):
        dl = Download()
        return dl.download(url, stream)
