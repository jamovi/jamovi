from asyncio import create_task
from asyncio import Task
from asyncio import CancelledError

from jamovi.server.jamovi_pb2 import AnalysisRequest

from jamovi.server.pool import Pool
from jamovi.server.logging import logger
from jamovi.server.utils import req_str
from jamovi.server.utils import ProgressStream

from .enginemanager import EngineManager
from .duckengine import DuckEngine


class DuckManager(EngineManager):
    """Engine Manager for a DuckDB backend"""

    _path: str
    _pool: "Pool"
    _config: dict
    _run_task: Task
    _workers: list[DuckEngine]

    def __init__(self, path: str, pool: "Pool", config: dict):
        super().__init__()
        self._path = path
        self._pool = pool
        self._config = config
        self._workers = list(
            map(lambda _: DuckEngine(path, config), range(self._pool.qsize))
        )

    async def start(self):
        """start the engine processes"""
        self._run_task = create_task(self._run_loop())
        for worker in self._workers:
            await worker.start()

    async def stop(self):
        """stop the engine processes"""
        for worker in self._workers:
            await worker.stop()
        self._run_task.cancel()

    async def restart_engines(self):
        """restart the engine processes"""
        for worker in self._workers:
            await worker.restart()

    async def _run_loop(self):
        try:
            analysis: tuple[AnalysisRequest, ProgressStream]
            async for analysis in self._pool.stream():
                logger.opt(lazy=True).debug(
                    "Analysis received {}", lambda: req_str(analysis[0])
                )
                self._run_analysis(analysis)
        except CancelledError:
            pass
        except Exception as e:
            logger.exception(e)

    def _run_analysis(self, analysis: tuple[AnalysisRequest, ProgressStream]):
        request, results = analysis
        worker = self._get_worker(request)
        worker.run_analysis(request, results)

    def _get_worker(self, request: AnalysisRequest):
        for worker in self._workers:
            if worker.current_request is None:
                continue
            # replace a superceded analysis
            if (
                request.instanceId == worker.current_request.instanceId
                and request.analysisId == worker.current_request.analysisId
            ):
                return worker
        for worker in self._workers:
            if worker.current_request is None:
                return worker
        raise RuntimeError

    def add_engine_listener(self, listener):
        """add a listener for engine events"""
        # TODO
        pass
