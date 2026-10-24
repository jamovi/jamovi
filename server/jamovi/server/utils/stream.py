from asyncio import Future
from asyncio import Event
from asyncio import Task
from asyncio import ensure_future as create_task
from asyncio import InvalidStateError

from collections import deque
from functools import wraps
from typing import Any
from typing import Awaitable
from typing import Callable
from typing import Concatenate
from typing import Generic
from typing import ParamSpec
from typing import TypeVar


P = TypeVar('P')
R = TypeVar('R')
S = TypeVar('S')
FnP = TypeVar('FnP')
FnR = TypeVar('FnR')
FnA = ParamSpec('FnA')


class ProgressStream(Future[R], Generic[P, R]):
    '''an async task that reports progress as it runs. iterate over it
    (async for) for the progress, then await it for the result (or the
    exception). iteration ends when the task does, whether it succeeds or
    fails. progress is conflated: a slow consumer sees only the latest
    progress (or the latest maxsize progresses), and none that arrives
    after the task ends.

        @progress_stream
        async def method(self, progress, *args):  # called as method(*args)
            ...
            return result

        ProgressStream.run(fn, *args)  # fn(progress, *args) returns the result

    or, where the task is settled from elsewhere:

        stream = ProgressStream()
        stream.write(p); stream.set_result(r)

    used as a context manager (async with), it's cancelled on exit
    '''

    def __init__(self, maxsize: int = 1) -> None:
        super().__init__()
        self._progress: deque[P] = deque(maxlen=maxsize)  # yet to be read
        self._changed = Event()
        self._task: Task[R] | None = None
        self.add_done_callback(lambda _: self._changed.set())

    @staticmethod
    def run(fn: Callable[Concatenate[Callable[[FnP], None], FnA], Awaitable[FnR]],
            *args: FnA.args,
            **kwargs: FnA.kwargs) -> 'ProgressStream[FnP, FnR]':
        '''runs fn as a task, settling the stream from its result (or
        exception). cancelling the stream cancels the task'''
        stream: ProgressStream[FnP, FnR] = ProgressStream()
        stream._start(fn(stream.write, *args, **kwargs))
        return stream

    def _start(self, coro: Awaitable[R]) -> None:
        self._task = create_task(coro)
        self._task.add_done_callback(self._settle)

    def _settle(self, task: 'Task[R]') -> None:
        if self.done():
            return
        if task.cancelled():
            super().cancel()
        elif (e := task.exception()) is not None:
            self.set_exception(e)
        else:
            self.set_result(task.result())

    def write(self, progress: P) -> None:
        if self.done():
            raise InvalidStateError
        self._progress.append(progress)
        self._changed.set()

    def cancel(self, msg: Any | None = None) -> bool:
        if self._task is not None:
            self._task.cancel(msg)
        return super().cancel(msg)

    async def __aenter__(self) -> 'ProgressStream[P, R]':
        return self

    async def __aexit__(self, *exc: object) -> None:
        self.cancel()

    def __aiter__(self) -> 'ProgressStream[P, R]':
        return self

    async def __anext__(self) -> P:
        while not self._progress and not self.done():
            self._changed.clear()
            await self._changed.wait()
        if self.done():
            raise StopAsyncIteration
        return self._progress.popleft()


def progress_stream(fn: Callable[Concatenate[S, Callable[[FnP], None], FnA], Awaitable[FnR]]
                    ) -> Callable[Concatenate[S, FnA], ProgressStream[FnP, FnR]]:
    '''makes an async method return a ProgressStream (see ProgressStream.run).
    the method takes progress after self, but is called without it'''
    @wraps(fn)
    def method(self: S, *args: FnA.args, **kwargs: FnA.kwargs) -> ProgressStream[FnP, FnR]:
        stream: ProgressStream[FnP, FnR] = ProgressStream()
        stream._start(fn(self, stream.write, *args, **kwargs))
        return stream
    return method
