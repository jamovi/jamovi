
from asyncio import Queue


class EngineManager:

    def __init__(self):
        self._notifications = Queue()

    async def start(self):
        raise NotImplementedError

    async def stop(self):
        raise NotImplementedError

    async def restart_engines(self):
        pass

    def add_engine_listener(self, listener):
        raise NotImplementedError

    def notifications(self):
        return self._notifications
