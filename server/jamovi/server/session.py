
import asyncio
import os
import uuid

from itertools import chain
import platform

from .instance import Instance
from .analyses import AnalysisIterator
from .enginemanager import EngineManager
from .scheduler import Scheduler

if platform.uname().system != 'Windows':
    from .remotequeue import RemoteQueue

from .settings import Settings
from .utils import conf

from logging import getLogger


log = getLogger(__name__)


class NoSuchInstanceException(Exception):
    pass


class Session(dict):

    def __init__(self, data_path, id):
        self._path = data_path
        self._id = id
        self._session_path = os.path.join(data_path, id)
        self._update_status = 'na'
        self._analyses = SessionAnalyses(self)
        self._analysis_listeners = [ ]
        self._running = True

        task_queue_url = conf.get('task-queue-url')
        if task_queue_url is not None:
            self._scheduler = Scheduler(1, 3, self._analyses)
            self._runner = RemoteQueue(task_queue_url, self._scheduler.queue)
        else:
            self._scheduler = Scheduler(1, 3, self._analyses)
            self._runner = EngineManager(self._path, self._scheduler.queue)
            self._runner.add_engine_listener(self._on_engine_event)

        self._start_gc()

    async def start(self):
        await self._runner.start()

    def __getitem__(self, id):
        try:
            return dict.__getitem__(self, id)
        except KeyError:
            raise NoSuchInstanceException()

    @property
    def id(self):
        return self._id

    def create(self, instance_id=None):
        if instance_id is None:
            instance_id = str(uuid.uuid4())
        log.info('%s %s', 'creating instance:', instance_id)
        instance_path = os.path.join(self._session_path, instance_id)
        instance = Instance(self, instance_path, instance_id)
        instance.analyses.add_options_changed_listener(self._options_changed_handler)
        self[instance_id] = instance
        return instance

    async def restart_engines(self):
        if isinstance(self._runner, EngineManager):
            await self._runner.restart_engines()

    def rerun_analyses(self):
        for analysis in self._analyses:
            analysis.rerun()

    def _on_engine_event(self, event):
        if event['type'] == 'error':
            message = event.get('message', '')
            cause = event.get('cause', '')
            for instance in self.values():
                instance.terminate(message, cause)

    def add_options_changed_listener(self, listener):
        self._analysis_listeners.append(listener)

    def _options_changed_handler(self, analysis):
        for listener in self._analysis_listeners:
            listener(analysis)

    @property
    def analyses(self):
        return self._analyses

    def notify_global_changes(self):
        for instance in self.values():
            if instance.is_active:
                instance._on_settings()

    def request_update(self, value):
        # this gets assigned to
        # (i.e. self.request_update = ...)
        pass

    @property
    def update_status(self):
        return self._update_status

    @property
    def session_path(self):
        return self._session_path

    def set_update_status(self, status):
        self._update_status = status
        self.notify_global_changes()

        if status == 'available':
            settings = Settings.retrieve('main')
            settings.sync()
            if settings.get('autoUpdate', False):
                self._update_status_req('downloading')

    def set_update_request_handler(self, request_fun):
        self.request_update = request_fun

    def _start_gc(self):

        async def gc(self):
            while self._running:
                await asyncio.sleep(.3)
                for id, instance in self.items():
                    if instance.inactive_for > 2:
                        log.info('%s %s', 'ending instance:', id)
                        instance.close()
                        del self[id]
                        break

        asyncio.get_event_loop().create_task(gc(self))


class SessionAnalyses:

    def __init__(self, session):
        self._session = session

    def __iter__(self):
        all_analyses = map(lambda inst: inst.analyses, self._session.values())
        all_analyses = chain.from_iterable(all_analyses)
        return all_analyses.__iter__()

    def get(self, analysis_id, instance_id=None):
        for analysis in self:
            if analysis_id == analysis.id:
                if instance_id is None:
                    return analysis
                elif instance_id == analysis.instance.id:
                    return analysis
        return None

    def add_options_changed_listener(self, listener):
        self._session.add_options_changed_listener(listener)

    @property
    def needs_init(self):
        return AnalysisIterator(self, True)

    @property
    def needs_run(self):
        return AnalysisIterator(self, False)

    @property
    def needs_op(self):
        return AnalysisIterator(self, needs_op=True)
