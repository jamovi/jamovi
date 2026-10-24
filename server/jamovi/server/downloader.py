
from tempfile import TemporaryFile
from typing import IO
from typing import Callable

import aiohttp

from .utils import ssl_context
from .utils.stream import progress_stream
from .i18n import _


class DownloadError(Exception):
    def __init__(self, message=None, status=None):
        self.status = status
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


class Download:
    def __init__(self):
        self._ssl_context = ssl_context()

    @progress_stream
    async def download(self, progress: Callable[[tuple[int, int]], None], url: str, file: IO[bytes] | None = None) -> IO[bytes] | None:
        progress((0, 1))
        try:
            # trust_env, so we go through the user's proxy (env vars, or the
            # system settings on windows/macOS).
            async with aiohttp.ClientSession(trust_env=True) as session:
                async with session.get(
                    url,
                    ssl=self._ssl_context,
                    timeout=aiohttp.ClientTimeout(total=24 * 60 * 60),
                ) as response:
                    response.raise_for_status()
                    size = -1
                    content_length = response.headers.get('Content-Length')
                    if content_length is not None:
                        size = int(content_length)
                    received = 0
                    async for chunk in response.content.iter_chunked(64 * 1024):
                        if file is None:
                            file = TemporaryFile()
                        file.write(chunk)
                        received += len(chunk)
                        progress((received, size))
            if file is not None:
                file.flush()
                file.seek(0)
            return file
        except aiohttp.ClientResponseError as e:
            raise DownloadError(status=e.status) from e
        except aiohttp.ClientSSLError as e:
            try:
                async with aiohttp.ClientSession(trust_env=True) as session:
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
