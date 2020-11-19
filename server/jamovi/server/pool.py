

from collections import OrderedDict
from asyncio import Semaphore
from asyncio import QueueFull
from asyncio import Event

from .utils import req_str
from .utils.stream import Stream

from logging import getLogger


log = getLogger(__name__)


class Pool:

    def __init__(self, n_slots):
        self._n_slots = n_slots
        self._wait_tx = OrderedDict()
        self._wait_tx_sem = Semaphore(0)
        self._wait_rx = OrderedDict()
        self._not_full = Event()
        self._not_full.set()

    @property
    def n_slots(self):
        return self._n_slots

    @property
    def is_full(self):
        return len(self._wait_tx) + len(self._wait_rx) >= self._n_slots

    def full(self):
        return len(self._wait_tx) + len(self._wait_rx) >= self._n_slots

    async def wait_not_full(self):
        await self._not_full.wait()

    @property
    def qsize(self):
        return self._n_slots

    def put_nowait(self, request):
        instance_id = request.instanceId
        analysis_id = request.analysisId
        key = (instance_id, analysis_id)

        existing = self._wait_tx.get(key)

        if existing is not None:
            ex_request, ex_stream = existing
            log.debug('%s %s', 'cancelling', req_str(ex_request))
            ex_stream.cancel()
        else:
            existing = self._wait_rx.get(key)
            if existing is not None:
                ex_request, ex_stream = existing
                log.debug('%s %s', 'cancelling', req_str(ex_request))
                ex_stream.cancel()

        if self.full():
            raise QueueFull

        stream = Stream()
        log.debug('%s %s', 'queueing', req_str(request))
        self._wait_tx[key] = (request, stream)
        if self._wait_tx_sem.locked():
            self._wait_tx_sem.release()
        stream.add_complete_listener(self._stream_complete)
        if self.is_full:
            self._not_full.clear()
        return stream

    def add(self, request):
        return self.put_nowait(request)

    def cancel(self, key):
        existing = self._wait_tx.get(key)
        if existing is not None:
            ex_request, ex_stream = existing
            log.debug('%s %s', 'cancelling', req_str(ex_request))
            ex_stream.cancel()
        else:
            existing = self._wait_rx.get(key)
            if existing is not None:
                ex_request, ex_stream = existing
                log.debug('%s %s', 'cancelling', req_str(ex_request))
                ex_stream.cancel()
            else:
                raise KeyError

    def get(self, key):
        value = self._wait_tx.get(key)
        if value is not None:
            return value
        value = self._wait_rx.get(key)
        if value is not None:
            return value
        return None

    def _stream_complete(self):
        # iterate through a copied list so we can delete from the original
        for key, value in list(self._wait_rx.items()):
            request, stream = value
            if stream.is_complete:
                del self._wait_rx[key]
                log.debug('%s %s', 'removing', req_str(request))
        for key, value in list(self._wait_tx.items()):
            request, stream = value
            if stream.is_complete:
                del self._wait_tx[key]
                log.debug('%s %s', 'removing', req_str(request))
        if not self.is_full:
            self._not_full.set()

    async def stream(self):

        while True:
            await self._wait_tx_sem.acquire()
            while len(self._wait_tx) > 0:
                key, value = self._wait_tx.popitem()
                self._wait_rx[key] = value
                request, stream = value
                log.debug('%s %s', 'yielding', req_str(request))
                yield value

    def __contains__(self, value):
        return value in self._wait_tx or value in self._wait_rx
