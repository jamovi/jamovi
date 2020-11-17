
from asyncio import Queue as AsyncQueue
from asyncio import wait
from asyncio import FIRST_COMPLETED
from asyncio import ensure_future as create_task
from logging import getLogger

from .analyses import Analysis
from .jamovi_pb2 import AnalysisRequest
from .jamovi_pb2 import AnalysisStatus
from .pool import Pool
from .utils import req_str


log = getLogger(__name__)


class Scheduler:

    def __init__(self, n_init_slots, n_run_slots, analyses):
        self._n_init_slots = n_init_slots
        self._n_run_slots = n_run_slots
        self._n_slots = n_init_slots + n_run_slots
        self._analyses = analyses

        self._n_initing = 0
        self._n_running = 0

        self._analyses.add_options_changed_listener(self._send_next)

        self._pool = Pool(self._n_slots)

        self._new_tasks = AsyncQueue()
        self._run_loop_task = create_task(self._run_loop())

    def _send_next(self, analysis=None):

        # print('counts', self._n_initing, self._n_running, self._n_slots, self._n_run_slots)

        # if the analysis already running, update the queue
        if analysis is not None:
            key = (analysis.instance.id, analysis.id)
            if key in self._pool:
                analysis.status = Analysis.Status.RUNNING
                request = self._to_message(analysis, 'init')
                self._run_analysis(request)
                self._n_initing += 1
                log.debug('%s %s %s', 'inc_counters', 'initing', (self._n_initing, self._n_running, self._n_slots))

        if self._n_initing + self._n_running >= self._n_slots:
            return

        for analysis in self._analyses.needs_init:
            analysis.status = Analysis.Status.RUNNING
            request = self._to_message(analysis, 'init')
            self._run_analysis(request)
            self._n_initing += 1
            log.debug('%s %s %s', 'inc_counters', 'initing', (self._n_initing, self._n_running, self._n_slots))
            if self._n_initing + self._n_running >= self._n_slots:
                return

        if self._n_running >= self._n_run_slots:
            return

        for analysis in self._analyses.needs_op:
            analysis.status = Analysis.Status.RUNNING
            request = self._to_message(analysis, 'op')
            self._run_analysis(request)
            self._n_running += 1
            log.debug('%s %s %s', 'inc_counters', 'running', (self._n_initing, self._n_running, self._n_slots))
            if self._n_running + self._n_initing >= self._n_slots:
                return
            if self._n_running >= self._n_run_slots:
                return

        for analysis in self._analyses.needs_run:
            analysis.status = Analysis.Status.RUNNING
            request = self._to_message(analysis, 'run')
            self._run_analysis(request)
            self._n_running += 1
            log.debug('%s %s %s', 'inc_counters', 'running', (self._n_initing, self._n_running, self._n_slots))
            if self._n_running + self._n_initing >= self._n_slots:
                return
            if self._n_running >= self._n_run_slots:
                return

    def _run_analysis(self, request):
        log.debug('%s %s', 'sending_to_pool', req_str(request))
        stream = self._pool.add(request)
        task = create_task(self._handle_results(request, stream))
        self._new_tasks.put_nowait(task)

    async def _run_loop(self):

        async def wait_for_new():
            return await self._new_tasks.get()

        pending = set()
        wait_for_new_task = create_task(wait_for_new())
        pending.add(wait_for_new_task)

        try:
            while True:
                done, pending = await wait(pending, return_when=FIRST_COMPLETED)
                if wait_for_new_task in done:
                    new_task = wait_for_new_task.result()
                    pending.add(new_task)

                for task in done:
                    if task.cancelled():
                        continue
                    e = task.exception()
                    if e is not None:
                        log.exception(e)

                if wait_for_new_task in done:
                    wait_for_new_task = create_task(wait_for_new())
                    pending.add(wait_for_new_task)

        except Exception as e:
            log.exception(e)
        finally:
            for task in pending:
                task.cancel()

    async def _handle_results(self, request, stream):

        instance_id = request.instanceId
        analysis_id = request.analysisId
        analysis = self._analyses.get(analysis_id, instance_id)
        INIT = AnalysisRequest.Perform.Value('INIT')
        SAVE = AnalysisRequest.Perform.Value('SAVE')

        try:
            async for results in stream:
                if analysis is not None:
                    log.debug('%s %s', 'results_received', req_str(request))
                    if request.perform == SAVE:
                        if results.status == AnalysisStatus.Value('ANALYSIS_ERROR'):
                            analysis.op.set_exception(ValueError(results.error.message))
                        else:
                            analysis.op.set_result(results)
                        analysis.status = Analysis.Status.COMPLETE
                    else:
                        analysis.set_results(results, stream.is_complete)
                        if stream.is_complete:
                            if results.status == AnalysisStatus.Value('ANALYSIS_ERROR'):
                                analysis.status = Analysis.Status.ERROR
                            elif request.perform == INIT:
                                analysis.status = Analysis.Status.INITED
                            else:
                                analysis.status = Analysis.Status.COMPLETE
        finally:
            if request.perform == INIT:
                self._n_initing -= 1
                log.debug('%s %s %s', 'dec_counters', 'initing', (self._n_initing, self._n_running, self._n_slots))
            else:
                self._n_running -= 1
                log.debug('%s %s %s', 'dec_counters', 'running', (self._n_initing, self._n_running, self._n_slots))

            self._send_next()

    @property
    def queue(self):
        return self._pool

    def _to_message(self, analysis, perform, request_pb=None):

        if request_pb is None:
            request_pb = AnalysisRequest()

        request_pb.sessionId = analysis.instance.session.id
        request_pb.instanceId = analysis.instance.id
        request_pb.analysisId = analysis.id
        request_pb.name = analysis.name
        request_pb.ns = analysis.ns

        for addon in analysis.addons:
            addon_pb = request_pb.addons.add()
            self._to_message(addon, perform, addon_pb)

        if analysis.complete and analysis.needs_op:

            analysis.op.waiting = False

            request_pb.options.CopyFrom(analysis.options.as_pb())
            request_pb.perform = AnalysisRequest.Perform.Value('SAVE')
            request_pb.path = analysis.op.path
            request_pb.part = analysis.op.part

        else:

            analysis.status = Analysis.Status.RUNNING

            request_pb.options.CopyFrom(analysis.options.as_pb())
            request_pb.changed.extend(analysis.changes)
            request_pb.revision = analysis.revision
            request_pb.clearState = analysis.clear_state

            if perform == 'init':
                request_pb.perform = AnalysisRequest.Perform.Value('INIT')
            else:
                request_pb.perform = AnalysisRequest.Perform.Value('RUN')

        return request_pb
