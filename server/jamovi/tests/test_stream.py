
from asyncio import CancelledError
from asyncio import InvalidStateError
from asyncio import gather
from asyncio import sleep
from asyncio import ensure_future as create_task

import pytest

from jamovi.server.utils.stream import ProgressStream
from jamovi.server.utils.stream import progress_stream


async def _collect(stream):
    seen = []
    async for progress in stream:
        seen.append(progress)
    return seen


@pytest.mark.asyncio
async def test_yields_progress_then_result():
    async def work(progress):
        for i in range(3):
            progress(i)
            await sleep(0)
        return 'done'
    stream = ProgressStream.run(work)
    assert await _collect(stream) == [ 0, 1, 2 ]
    assert await stream == 'done'


@pytest.mark.asyncio
async def test_conflates_unread_progress():
    async def work(progress):
        for i in range(5):
            progress(i)
        return 'done'
    stream = ProgressStream.run(work)
    assert await _collect(stream) == [ 4 ]
    assert await stream == 'done'


@pytest.mark.asyncio
async def test_ends_iteration_when_done_with_progress_unread():
    stream = ProgressStream()
    seen = create_task(_collect(stream))
    await sleep(0)
    stream.write(1)
    stream.set_result('done')
    assert await seen == [ ]


@pytest.mark.asyncio
async def test_ends_iteration_when_already_failed():
    stream = ProgressStream()
    stream.set_exception(ValueError('boom'))
    assert await _collect(stream) == [ ]
    with pytest.raises(ValueError):
        await stream


@pytest.mark.asyncio
async def test_ends_iteration_when_failing():
    async def work(progress):
        progress(1)
        await sleep(0)
        raise ValueError('boom')
    stream = ProgressStream.run(work)
    assert await _collect(stream) == [ 1 ]
    with pytest.raises(ValueError):
        await stream


@pytest.mark.asyncio
async def test_passes_args_to_the_task():
    async def work(progress, a, b=None):
        return (a, b)
    assert await ProgressStream.run(work, 1, b=2) == (1, 2)


@pytest.mark.asyncio
async def test_cancelling_the_stream_cancels_the_task():
    started = False
    finished = False

    async def work(progress):
        nonlocal started, finished
        started = True
        await sleep(10)
        finished = True

    stream = ProgressStream.run(work)
    await sleep(0)
    assert stream.cancel() is True
    assert await _collect(stream) == [ ]
    with pytest.raises(CancelledError):
        await stream
    await sleep(0)
    assert started and not finished
    assert stream._task.cancelled()


@pytest.mark.asyncio
async def test_rejects_progress_once_done():
    stream = ProgressStream()
    stream.set_result('done')
    with pytest.raises(InvalidStateError):
        stream.write(1)


@pytest.mark.asyncio
async def test_ends_every_consumer():
    stream = ProgressStream()
    seen = gather(_collect(stream), _collect(stream))
    await sleep(0)
    stream.write(1)
    await sleep(0)
    stream.set_result('done')
    first, second = await seen
    assert first + second == [ 1 ]


@pytest.mark.asyncio
async def test_decorated_method_returns_a_stream():
    class Thing:
        def __init__(self):
            self.offset = 10

        @progress_stream
        async def work(self, progress, n, extra=0):
            for i in range(n):
                progress(i)
                await sleep(0)
            return self.offset + n + extra

    stream = Thing().work(3, extra=1)
    assert isinstance(stream, ProgressStream)
    assert await _collect(stream) == [ 0, 1, 2 ]
    assert await stream == 14


@pytest.mark.asyncio
async def test_buffers_up_to_maxsize_progresses():
    stream = ProgressStream(maxsize=3)
    for i in range(5):
        stream.write(i)
    seen = create_task(_collect(stream))
    await sleep(0)
    stream.set_result('done')
    assert await seen == [ 2, 3, 4 ]


@pytest.mark.asyncio
async def test_is_cancelled_on_leaving_a_context():
    async with ProgressStream() as stream:
        pass
    assert stream.cancelled()
