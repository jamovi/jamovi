
import re
from tempfile import TemporaryFile

from tornado.httpclient import AsyncHTTPClient


class Download:
    def __init__(self, url, callback):
        self._url = url
        self._callback = callback
        self._progress = 0
        self._size = -1
        self._status = 0
        self._complete = False
        self._content = None

        client = AsyncHTTPClient()
        response = client.fetch(
            url,
            header_callback=self._header_callback,
            streaming_callback=self._streaming_callback)
        response.add_done_callback(self._done_callback)
        self._callback('progress', (0, 1))

    def _done_callback(self, future):
        try:
            future.result()
            self._complete = True
            self._content.flush()
            self._content.seek(0)
            self._callback('success', self._content)
        except Exception as e:
            if not self._complete:
                self._callback('error', e)

    def _header_callback(self, line):
        match = re.match('Content-Length:[\s]*([0-9]+)', line)
        if match:
            self._size = int(match.group(1))

    def _streaming_callback(self, chunk):
        if self._content is None:
            self._content = TemporaryFile()

        self._content.write(chunk)
        self._progress += len(chunk)
        self._callback('progress', (self._progress, self._size))


class Downloader:
    @staticmethod
    def download(url, callback):
        Download(url, callback)
