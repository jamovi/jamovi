
import re
import os.path as path
from tempfile import TemporaryFile
import certifi


from functools import partial
from asyncio import create_task

from tornado.simple_httpclient import SimpleAsyncHTTPClient as AsyncHTTPClient

from .utils import conf
from .utils.stream import ProgressStream

from tornado.httpclient import HTTPError as TornadoHTTPError
from ssl import SSLCertVerificationError

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


class DownloadInfo:
    def __init__(self, response, progress, size, file, stream):
        self.response = response
        self.progress = progress
        self.size = size
        self.file = file
        self.stream = stream


class Download:
    def __init__(self):
        self._chain_path = certifi.where()
        self._client = AsyncHTTPClient(max_body_size=512 * 1024 * 1024)

    def download(self, url, io=None):

        info = DownloadInfo(None, 0, -1, io, ProgressStream())

        header_callback = partial(self._header_callback, info)
        streaming_callback = partial(self._streaming_callback, info)
        complete_callback = partial(self._complete, info)

        response = self._client.fetch(
            url,
            header_callback=header_callback,
            streaming_callback=streaming_callback,
            request_timeout=24 * 60 * 60,
            ca_certs=self._chain_path)

        info.response = response

        info.stream.write((0, 1))
        task = create_task(self._download(info))
        task.add_done_callback(complete_callback)

        return info.stream

    def _complete(self, info, result):
        try:
            result.result()
        except Exception as e:
            info.stream.set_exception(e)

    async def _download(self, info):

        try:
            await info.response
            info.file.flush()
            info.file.seek(0)
            info.stream.set_result(info.file)
        except SSLCertVerificationError as e:
            try:
                # check for captive portal
                response = await self._client.fetch(
                    'http://clients3.google.com/generate_204')
                if response.code != 204:
                    raise CaptivePortalError from e
                else:
                    raise DownloadError from e
            except OSError:
                raise NoNetworkError from e
        except OSError as e:
            raise NoNetworkError from e


    def _header_callback(self, info, line):
        match = re.match(r'Content-Length:[\s]*([0-9]+)', line)
        if match:
            info.size = int(match.group(1))

    def _streaming_callback(self, info, chunk):
        if info.file is None:
            info.file = TemporaryFile()

        info.file.write(chunk)
        info.progress += len(chunk)
        info.stream.write((info.progress, info.size))


class Downloader:
    @staticmethod
    def download(url):
        dl = Download()
        return dl.download(url)

    @staticmethod
    def download_to(url, stream):
        dl = Download()
        return dl.download(url, stream)
