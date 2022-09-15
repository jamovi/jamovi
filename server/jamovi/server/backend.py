

import json
import os

from asyncio import Queue
from asyncio import QueueEmpty
from asyncio import create_task
from asyncio import sleep


class Backend:
    def __init__(self, *, flush_rate=None):
        self._flush_rate = flush_rate
        self._queue = Queue(maxsize=1)
        self._flush_task = None

    async def read_settings(self):
        return self.read_settings_nowait()

    def set_settings(self, values):
        if self._queue.full():
            self._queue.get_nowait()
        self._queue.put_nowait(values)
        if self._flush_task is None or self._flush_task.done():
            self._flush_task = create_task(self._flush())
            self._flush_task.add_done_callback(lambda t: t.result())

    def read_settings_nowait(self):
        raise NotImplementedError
    
    def is_synchronous(self):
        return True

    def set_auth(self, auth):
        pass

    async def _flush(self):
        if self._flush_rate is not None:
            await sleep(self._flush_rate)
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
    from .backend2 import FirestoreBackend
except ModuleNotFoundError:
    class FirestoreBackend(NoBackend):
        pass


class FileSystemBackend(Backend):

    def __init__(self, *, settings_path):
        super().__init__(flush_rate=5)
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
