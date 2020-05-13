

from collections import OrderedDict
from asyncio import Semaphore
from asyncio import QueueFull

from .utils import req_str
from .utils.stream import Stream

from logging import getLogger


log = getLogger(__name__)


class Queue:

    def __init__(self, n_slots):
        self._n_slots = n_slots
        self._wait_tx = OrderedDict()
        self._wait_tx_sem = Semaphore(0)
        self._wait_rx = OrderedDict()

    @property
    def n_slots(self):
        return self._n_slots

    @property
    def is_full(self):
        return len(self._wait_tx) + len(self._wait_rx) >= self._n_slots

    @property
    def qsize(self):
        return self._n_slots

    def add(self, request):

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

        if self.is_full:
            raise QueueFull

        stream = Stream()
        log.debug('%s %s', 'queueing', req_str(request))
        self._wait_tx[key] = (request, stream)
        if self._wait_tx_sem.locked():
            self._wait_tx_sem.release()
        stream.add_complete_listener(self._stream_complete)
        return stream

    def get(self, key):
        value = self._wait_tx.get(key)
        if value is not None:
            return value
        value = self._wait_rx.get(key)
        if value is not None:
            return value
        return None

    def _stream_complete(self):
        for key, value in self._wait_rx.items():
            request, stream = value
            if stream.is_complete:
                del self._wait_rx[key]
                log.debug('%s %s', 'removing', req_str(request))
                break

    def stream(self):

        # # this isn't compatible with python 3.5:
        # while True:
        #     await self._wait_tx_sem.acquire()
        #     while len(self._wait_tx) > 0:
        #         key, value = self._wait_tx.popitem()
        #         self._wait_rx[key] = value
        #         request, stream = value
        #         log.debug('%s %s', 'yielding', req_str(request))
        #         yield value
        # # so we had to do this:

        class AsyncGenerator:
            def __init__(self, parent):
                self._parent = parent

            def __aiter__(self):
                return self

            async def __anext__(self):
                if len(self._parent._wait_tx) == 0:
                    await self._parent._wait_tx_sem.acquire()
                key, value = self._parent._wait_tx.popitem()
                self._parent._wait_rx[key] = value
                request, stream = value
                log.debug('%s %s', 'yielding', req_str(request))
                return value

        return AsyncGenerator(self)

    def __contains__(self, value):
        return value in self._wait_tx or value in self._wait_rx
