
import re
import os.path as path
from tempfile import TemporaryFile

from tornado.httpclient import AsyncHTTPClient

from .utils import conf
from .utils.stream import Stream


class Download:
    def __init__(self, url):
        self._url = url
        self._progress = 0
        self._size = -1
        self._file = None
        self._stream = Stream()

        server_path = conf.get('server_path')
        if server_path is not None:
            chain_path = path.join(server_path, 'resources', 'chain.pem')
            if not path.isfile(chain_path):
                chain_path = None
        else:
            chain_path = None

        client = AsyncHTTPClient()
        response = client.fetch(
            url,
            header_callback=self._header_callback,
            streaming_callback=self._streaming_callback,
            request_timeout=24 * 60 * 60,
            ca_certs=chain_path)
        response.add_done_callback(self._done_callback)
        self._stream.write((0, 1), last=False)

    def _done_callback(self, future):
        try:
            future.result()
            self._file.flush()
            self._file.seek(0)
            self._stream.write(self._file, last=True)
        except Exception as e:
            self._stream.abort(e)

    def _header_callback(self, line):
        match = re.match(r'Content-Length:[\s]*([0-9]+)', line)
        if match:
            self._size = int(match.group(1))

    def _streaming_callback(self, chunk):
        if self._file is None:
            self._file = TemporaryFile()

        self._file.write(chunk)
        self._progress += len(chunk)
        self._stream.write((self._progress, self._size), last=False)


class Downloader:
    @staticmethod
    def download(url):
        dl = Download(url)
        return dl._stream
