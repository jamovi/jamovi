
import platform

import tempfile
from uuid import uuid4

from asyncio import QueueFull
from asyncio import ensure_future as create_task
from asyncio import CancelledError
from asyncio import wait

from .utils import req_str
from .engine import Engine

import logging

log = logging.getLogger(__name__)


class EngineManager:

    def __init__(self, data_path, queue, config, monitor=None):

        self._data_path = data_path
        self._queue = queue
        self._config = config
        self._monitor = monitor

        self._requests = [ None ] * queue.qsize
        self._engines = [ None ] * queue.qsize
        self._next_conn_index = 0

        self._message_id = 1
        self._listeners = [ ]

        if platform.uname().system == 'Windows':
            self._conn_root = "ipc://{}".format(str(uuid4()))
        else:
            self._dir = tempfile.TemporaryDirectory()  # assigned to self so it doesn't get cleaned up
            self._conn_root = "ipc://{}/conn".format(self._dir.name)

        for index in range(queue.qsize):
            engine = Engine(
                parent=self,
                data_path=data_path,
                conn_root=self._conn_root,
                config=self._config,
                monitor=self._monitor)
            self._engines[index] = engine

        self._run_loop_task = create_task(self._run_loop())

        mem_limit = self._config.get('memory_limit_engine', None)
        if mem_limit and platform.uname().system == 'Linux':
            log.info('Applying engine memory limit %s Mb', mem_limit)

    async def _run_loop(self):
        tasks = set()
        try:
            async for analysis in self._queue.stream():
                task = create_task(self._run_analysis(analysis))
                for t in tasks:
                    try:
                        if t.done():
                            # if the task threw an exception, then let's deal
                            # with that here
                            t.result()
                    except CancelledError:
                        pass
                    except Exception as e:
                        log.exception(e)
                tasks = set(filter(lambda t: not t.done(), tasks))
                tasks.add(task)
        except CancelledError:
            raise
        except Exception as e:
            log.exception(e)
        finally:
            for task in tasks:
                task.cancel()

    async def _run_analysis(self, analysis):
        request, stream = analysis

        for index, value in enumerate(self._requests):
            if value is not None:
                ex_request, ex_stream = value
                if (request.instanceId == ex_request.instanceId
                        and request.analysisId == ex_request.analysisId):
                    break
        else:
            for index, value in enumerate(self._requests):
                if value is None:
                    break
            else:
                raise QueueFull

        try:
            log.debug('%s %s on %s', 'running', req_str(request), index)
            self._requests[index] = (request, stream)
            await self._engines[index].run(request, stream)
            log.debug('%s %s', 'completed', req_str(request))
        except CancelledError:
            log.debug('%s %s', 'cancelled', req_str(request))
            raise
        except Exception as e:
            log.exception(e)
        finally:
            self._requests[index] = None

    async def start(self):
        await wait(map(lambda e: e.start(), self._engines))

    async def stop(self):
        await wait(map(lambda e: e.stop(), self._engines))

    async def restart_engines(self):
        await wait(map(lambda e: e.restart(), self._engines))

    def add_engine_listener(self, listener):
        self._listeners.append(('engine-event', listener))

    def _notify_engine_event(self, *args):
        for listener in self._listeners:
            if listener[0] == 'engine-event':
                listener[1](*args)
