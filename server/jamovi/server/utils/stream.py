
from asyncio import Queue
from asyncio import Future
from asyncio import Event
from asyncio import ensure_future as create_task
from asyncio import wait
from asyncio import InvalidStateError
from asyncio import FIRST_COMPLETED


class ProgressStream(Future):

    def __init__(self):
        super().__init__()
        self._progress = Queue()
        self._progress_task = create_task(self._progress.get())
        self._complete_task = create_task(self)

    def __aiter__(self):
        return self

    async def __anext__(self):

        if self.done():
            raise StopAsyncIteration

        done, pending = await wait({ self._complete_task, self._progress_task }, return_when=FIRST_COMPLETED)

        if self._complete_task in done:
            self._progress_task.cancel()
            self._complete_task.result()  # throws an exception (when necessary)
            raise StopAsyncIteration
        else:
            progress = self._progress_task.result()
            self._progress_task = create_task(self._progress.get())
            return progress

    def write(self, item):
        if self.done():
            raise InvalidStateError
        if self._progress.qsize() > 0:
            self._progress.get_nowait()
        self._progress.put_nowait(item)
