
from asyncio import Future
from asyncio import Event


class Stream:

    def __init__(self):
        self._future = Future()
        self._complete = Event()
        self._listeners = [ ]

    def __aiter__(self):
        return self

    async def __anext__(self):

        if self._complete.is_set():
            raise StopAsyncIteration

        result = await self._future
        self._future = Future()
        return result

    def write(self, item, last):
        if self._complete.is_set():
            return
        if last:
            self._set_complete()
        if self._future.done():
            self._future = Future()
        self._future.set_result(item)

    def cancel(self):
        self._set_complete()
        if self._future.done():
            self._future = Future()
        self._future.cancel()

    async def completed(self):
        await self._complete.wait()

    @property
    def is_complete(self):
        return self._complete.is_set()

    def add_complete_listener(self, listener):
        self._listeners.append(listener)

    def _set_complete(self):
        self._complete.set()
        for listener in self._listeners:
            listener()
