
import re
import os.path as path
from tempfile import TemporaryFile
import pkg_resources

from tornado.simple_httpclient import SimpleAsyncHTTPClient as AsyncHTTPClient

from .utils import conf
from .utils.stream import ProgressStream


class Download:
    def __init__(self, url, file=None):
        self._url = url
        self._progress = 0
        self._size = -1
        self._file = file
        self._stream = ProgressStream()

        chain_path = pkg_resources.resource_filename(__name__, 'resources/chain.pem')
        if not path.isfile(chain_path):
            chain_path = None

        client = AsyncHTTPClient(max_body_size=512 * 1024 * 1024)
        response = client.fetch(
            url,
            header_callback=self._header_callback,
            streaming_callback=self._streaming_callback,
            request_timeout=24 * 60 * 60,
            ca_certs=chain_path)
        response.add_done_callback(self._done_callback)
        self._stream.write((0, 1))

    def _done_callback(self, future):
        try:
            future.result()
            self._file.flush()
            self._file.seek(0)
            self._stream.set_result(self._file)
        except Exception as e:
            self._stream.set_exception(e)

    def _header_callback(self, line):
        match = re.match(r'Content-Length:[\s]*([0-9]+)', line)
        if match:
            self._size = int(match.group(1))

    def _streaming_callback(self, chunk):
        if self._file is None:
            self._file = TemporaryFile()

        self._file.write(chunk)
        self._progress += len(chunk)
        self._stream.write((self._progress, self._size))


class Downloader:
    @staticmethod
    def download(url):
        dl = Download(url)
        return dl._stream

    @staticmethod
    def download_to(url, stream):
        dl = Download(url, stream)
        return dl._stream
