
from asyncio import create_task
from asyncio import sleep
from asyncio import Event

import os
import uuid
import platform

from itertools import chain
from enum import Enum
from time import monotonic

from .instance import Instance
from .analyses import AnalysisIterator
from .enginemanager import EngineManager
from .scheduler import Scheduler
from . import i18n

if platform.uname().system != 'Windows':
    from .remotepool import RemotePool

from jamovi.core import Dirs

from .settings import Settings
from .utils import conf

from .backend import NoBackend
from .backend import FileSystemBackend

from logging import getLogger


log = getLogger(__name__)


class NoSuchInstanceException(Exception):
    pass


class SessionEvent:

    class Type(Enum):
        INSTANCE_STARTED = 1
        INSTANCE_ENDED = 2

    def __init__(self, type, instance_id):
        self.type = type
        self.instance_id = instance_id


class Session(dict):

    def __init__(self, data_path, id):
        self._path = data_path
        self._id = id
        self._session_path = os.path.join(data_path, id)
        self._update_status = 'na'
        self._analyses = SessionAnalyses(self)
        self._analysis_listeners = [ ]
        self._session_listeners = [ ]
        self._running = False
        self._ended = Event()

        self._settings = None

        language = ''

        backend_mode = conf.get('backend', 'file')
        if backend_mode == 'file':
            settings_path = os.path.join(Dirs.app_data_dir(), 'settings.json')
            self._backend = FileSystemBackend(settings_path=settings_path)

            # with a file backend, we need to read the settings straight away
            # to get the language
            settings = self.get_settings_nowait()
            language = settings.group('main').get('selectedLanguage', '')
        else:
            self._backend = NoBackend()

        if language == '':
            language = conf.get('lang', '')
        if language != '':
            i18n.set_language(language)

        task_queue_url = conf.get('task_queue_url')
        if task_queue_url is not None:
            self._scheduler = Scheduler(1, 3, self._analyses)
            self._runner = RemotePool(task_queue_url, self._scheduler.queue)
        else:
            self._scheduler = Scheduler(1, 3, self._analyses)
            self._runner = EngineManager(self._path, self._scheduler.queue, conf)

        self._runner.add_engine_listener(self._on_engine_event)

    async def start(self):
        await self._runner.start()
        t = create_task(self._run_loop())
        t.add_done_callback(lambda t: t.result())

    def __getitem__(self, id):
        try:
            return dict.__getitem__(self, id)
        except KeyError:
            raise NoSuchInstanceException()

    @property
    def id(self):
        return self._id

    def set_language(self, lang):
        if i18n.get_language() is None:  # if the language has already been set from conf then leave it alone
            i18n.set_language(lang)

    def set_auth(self, auth_token):
        self._backend.set_auth(auth_token)

    def get_settings_nowait(self):
        if self._settings is None:
            self._settings = Settings(backend=self._backend)
            self._specify_defaults(self._settings)
            self._settings.read_nowait()
        return self._settings

    async def get_settings(self):
        if self._settings is None:
            self._settings = Settings(backend=self._backend)
            self._specify_defaults(self._settings)
            await self._settings.read()
        return self._settings

    def _specify_defaults(self, settings):
        # until we deploy the windows updater and are happy with it,
        # we'll default autoUpdate to off -- macOS works well though.
        is_windows = platform.uname().system == 'Windows'
        def4ult = False if is_windows else True
        settings.group('main').specify_default('autoUpdate', def4ult)
        settings.group('main').specify_default('missings', 'NA')
        settings.group('main').specify_default('selectedLanguage', '')

    async def create(self, instance_id=None):
        if instance_id is None:
            instance_id = str(uuid.uuid4())
        log.info('%s %s', 'creating instance:', instance_id)
        instance_path = os.path.join(self._session_path, instance_id)
        settings = await self.get_settings()
        instance = Instance(self, instance_path, instance_id, settings)
        instance.analyses.add_options_changed_listener(self._options_changed_handler)
        self[instance_id] = instance
        self._notify_session_event(SessionEvent.Type.INSTANCE_STARTED, instance_id)
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
            self.stop()

    def add_options_changed_listener(self, listener):
        self._analysis_listeners.append(listener)

    def add_session_listener(self, listener):
        self._session_listeners.append(listener)

    def _options_changed_handler(self, analysis):
        for listener in self._analysis_listeners:
            listener(analysis)

    def _notify_session_event(self, event_type, instance_id):
        event = SessionEvent(event_type, instance_id)
        for listener in self._session_listeners:
            listener(event)

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
            main_settings = self._settings.group('main')
            if main_settings.get('autoUpdate', False):
                self.request_update('downloading')

    def set_update_request_handler(self, request_fun):
        self.request_update = request_fun

    def stop(self):
        # at present, this is only called when there are zero instances
        # which is why this doesn't bother cleaning anything up
        self._running = False

    async def _run_loop(self):

        try:
            TIMEOUT_NC = conf.get('timeout_no_connection', '')
            TIMEOUT_NC = int(TIMEOUT_NC)
        except Exception:
            TIMEOUT_NC = 3
            # if no timeout, default session expiry to off
            SESSION_EXPIRES = conf.get('session_expires', '0')
        else:
            # if timeout, default session expiry to on
            SESSION_EXPIRES = conf.get('session_expires', '1')

        SESSION_EXPIRES = (SESSION_EXPIRES != '0')

        SESSION_EXPIRES_PREVENT_PATH = conf.get('session_expires_prevent_path', None)

        def prevent_session_expiry(path):
            try:
                status = os.stat(path)
                if status.st_size != 0:
                    return True
            except FileNotFoundError:
                pass
            return False

        try:
            TIMEOUT_NC_UNCLEAN = conf.get('timeout_no_connection_unclean_disconnect', '')
            TIMEOUT_NC_UNCLEAN = int(TIMEOUT_NC_UNCLEAN)
        except Exception:
            # we use inf with electron, because it disconnects uncleanly
            # when the computer goes to sleep. this lets it resume the
            # connection when it awakes without it being gc'ed
            TIMEOUT_NC_UNCLEAN = float('inf')

        try:
            TIMEOUT_NC_VIRGIN = conf.get('timeout_no_connection_virgin', '')
            TIMEOUT_NC_VIRGIN = int(TIMEOUT_NC_VIRGIN)
        except Exception:
            TIMEOUT_NC_VIRGIN = TIMEOUT_NC_UNCLEAN

        if TIMEOUT_NC_UNCLEAN < TIMEOUT_NC:
            TIMEOUT_NC_UNCLEAN = TIMEOUT_NC

        try:
            TIMEOUT_IDLE = conf.get('timeout_idle', '')
            TIMEOUT_IDLE = float(TIMEOUT_IDLE)
        except Exception:
            TIMEOUT_IDLE = 0

        try:
            TIMEOUT_IDLE_NOTICE = conf.get('timeout_idle_notice', '')
            TIMEOUT_IDLE_NOTICE = float(TIMEOUT_IDLE_NOTICE)
        except Exception:
            TIMEOUT_IDLE_NOTICE = 0

        now = monotonic()
        session_no_connection_since = now
        session_no_connection_unclean = False
        session_idle_since = now
        idle_warning_since = None
        last_idle_warning = None

        self._running = True

        try:
            while self._running:
                await sleep(1)

                now = monotonic()

                for id, instance in dict(self).items():  # make a copy, so we can delete items while iterating

                    # determine idleness
                    idle_since = instance.idle_since()
                    if idle_since > session_idle_since:
                        session_idle_since = idle_since

                    status = instance.connection_status()
                    if not status.connected:

                        # determine time of most recent connection for session
                        if status.inactive_since > session_no_connection_since:
                            session_no_connection_since = status.inactive_since
                            session_no_connection_unclean = status.unclean

                        # close instances without connections
                        no_conn_for = now - status.inactive_since

                        if ((status.unclean and no_conn_for > TIMEOUT_NC_UNCLEAN)
                                or (status.virgin is True and no_conn_for > TIMEOUT_NC_VIRGIN)
                                or (status.virgin is False and status.unclean is False and no_conn_for > TIMEOUT_NC)):
                            log.info('%s %s', 'destroying instance:', id)
                            self._notify_session_event(SessionEvent.Type.INSTANCE_ENDED, id)
                            instance.close()
                            del self[id]
                    else:
                        # we've got a connection
                        session_no_connection_since = now
                        session_no_connection_unclean = False

                if SESSION_EXPIRES_PREVENT_PATH:
                    if prevent_session_expiry(SESSION_EXPIRES_PREVENT_PATH):
                        session_no_connection_since = now
                        session_idle_since = now

                if SESSION_EXPIRES and len(self) == 0:
                    # if there are no instances
                    no_conn_for = now - session_no_connection_since
                    # and no connections for a while, end the session
                    if ((session_no_connection_unclean and no_conn_for > TIMEOUT_NC_UNCLEAN)
                            or (session_no_connection_unclean is False and no_conn_for > TIMEOUT_NC)):
                        log.info('%s %s', 'ending session:', self._id)
                        self.stop()

                # now determine, notify, or end the session if the idle
                # criteria has been met
                idle_for = now - session_idle_since

                if TIMEOUT_IDLE == 0:
                    # do nothing
                    pass
                elif idle_for > TIMEOUT_IDLE:
                    self.stop()
                elif idle_for > (TIMEOUT_IDLE - TIMEOUT_IDLE_NOTICE):
                    # notify session is idle
                    if idle_warning_since is None:
                        idle_warning_since = now
                        id = int(idle_warning_since % (1 << 32))
                        self._notify_idle(id, TIMEOUT_IDLE - idle_for)
                        last_idle_warning = now
                    elif now - last_idle_warning > 30:
                        id = int(idle_warning_since % (1 << 32))
                        self._notify_idle(id, TIMEOUT_IDLE - idle_for)
                        last_idle_warning += 30
                else:
                    if idle_warning_since is not None:
                        # clear notification
                        id = int(idle_warning_since % (1 << 32))
                        self._notify_idle(id, None)
                        idle_warning_since = None
                        last_idle_warning = None
        finally:
            self._ended.set()

    async def wait_ended(self):
        await self._ended.wait()

    def _notify_idle(self, id, shutdown_in):
        for instance in self.values():
            instance.notify_idle(id, shutdown_in)


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
