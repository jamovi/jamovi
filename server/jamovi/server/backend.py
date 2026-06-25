

import json
import os

from asyncio import CancelledError
from asyncio import Queue
from asyncio import QueueEmpty
from asyncio import create_task
from asyncio import sleep


class Backend:
    def __init__(self, *, flush_delay=None):
        self._flush_delay = flush_delay
        self._queue = Queue(maxsize=1)
        self._flush_task = None

    async def read_settings(self):
        return self.read_settings_nowait()

    def set_settings(self, values):
        if self._queue.full():
            self._queue.get_nowait()
        self._queue.put_nowait(values)
        # debounce: restart the timer on every change, so we only flush
        # once activity has settled for flush_delay seconds
        if self._flush_task is not None and not self._flush_task.done():
            self._flush_task.cancel()
        self._flush_task = create_task(self._flush())
        self._flush_task.add_done_callback(self._flush_done)

    def _flush_done(self, task):
        if not task.cancelled():
            task.result()

    def read_settings_nowait(self):
        raise NotImplementedError

    def is_synchronous(self):
        return True

    def set_auth(self, auth):
        pass

    async def _flush(self):
        try:
            if self._flush_delay is not None:
                await sleep(self._flush_delay)
        except CancelledError:
            # superseded by a newer change; let the new task flush instead
            return
        await self.flush()

    async def flush(self):
        try:
            values = self._queue.get_nowait()
            await self.write_settings(values)
        except QueueEmpty:
            pass

    async def write_settings(self, values):
        pass


class NoBackend(Backend):
    async def read_settings_nowait(self):
        return { }


try:
    from .backend2 import HTTPBackend
except ModuleNotFoundError:
    class HTTPBackend(NoBackend):
        pass


class FileSystemBackend(Backend):

    def __init__(self, *, settings_path):
        super().__init__(flush_delay=5)
        self._settings_path = settings_path

    def read_settings_nowait(self):
        try:
            with open(self._settings_path, 'r', encoding='utf-8') as contents:
                data = json.load(contents)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print(e)
        return { }

    async def write_settings(self, values):
        try:
            temp_path = self._settings_path + '.tmp'
            with open(temp_path, 'w', encoding='utf-8') as file:
                json.dump(values, file)
            os.replace(temp_path, self._settings_path)
        except Exception as e:
            print(e)
