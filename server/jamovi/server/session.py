
from asyncio import wait
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
from .engine import EngineFactory
from .scheduler import Scheduler
from . import i18n

from jamovi.core import Dirs

from .settings import Settings
from .utils import conf
from .notifications import SessionShutdownIdleNotification
from .notifications import SessionShutdownTimeLimitNotification

from .backend import NoBackend
from .backend import FirestoreBackend
from .backend import FileSystemBackend
from .modules import Modules

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
        self._analyses = SessionAnalyses(self)
        self._analysis_listeners = [ ]
        self._session_listeners = [ ]
        self._running = False
        self._ended = Event()

        language = ''

        backend_mode = conf.get('backend', 'file')
        if backend_mode == 'file':
            settings_path = os.path.join(Dirs.app_data_dir(), 'settings.json')
            self._backend = FileSystemBackend(settings_path=settings_path)
        elif backend_mode == 'firestore':
            backend_url = conf.get('backend_url')
            self._backend = FirestoreBackend(firestore_url=backend_url)
        else:
            self._backend = NoBackend()

        self._settings = Settings(backend=self._backend)
        self._specify_defaults(self._settings)

        if backend_mode == 'file':
            self._settings.read_nowait()
            language = self._settings.group('main').get('selectedLanguage', '')

        self._modules = Modules(self._settings.group('modules'))

        if language == '':
            language = conf.get('lang', '')
        if language != '':
            i18n.set_language(language)

        self._scheduler = Scheduler(1, 3, self._analyses, self._modules)

        task_queue_url: str | None = conf.get('task_queue_url')
        if task_queue_url is not None:
            self._runner = EngineFactory.create('remote', task_queue_url, self._scheduler.queue, conf)
        else:
            self._runner = EngineFactory.create('shmem', self._path, self._scheduler.queue, conf)

        self._runner.add_engine_listener(self._on_engine_event)

    async def start(self):
        await self._modules.read()
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

    @property
    def modules(self):
        return self._modules

    def set_language(self, lang):
        if i18n.get_language() is None:  # if the language has already been set from conf then leave it alone
            i18n.set_language(lang)

    def get_language(self):
        return i18n.get_language()

    def set_auth(self, auth_token):
        self._backend.set_auth(auth_token)

    def apply_settings(self, settings: dict):
        if 'updateStatus' in settings:
            update_status = settings['updateStatus']
            if (update_status != self.update_status
                    and (update_status == 'checking' or update_status == 'downloading')):
                self.request_update(update_status)
        self._settings.apply({ 'main': settings })
        self.notify_global_changes()

    def _specify_defaults(self, settings):
        # until we deploy the windows updater and are happy with it,
        # we'll default autoUpdate to off -- macOS works well though.
        is_windows = platform.uname().system == 'Windows'
        def4ult = False if is_windows else True
        settings.group('main').specify_default('autoUpdate', def4ult)
        settings.group('main').specify_default('missings', 'NA')
        settings.group('main').specify_default('selectedLanguage', '')
        settings.group('main').specify_default('updateStatus', 'na')

    async def create(self, instance_id=None):

        # the auth token should have been set by now,
        # so we can read the settings
        await self._settings.read()

        if instance_id is None:
            instance_id = str(uuid.uuid4())

        instance_path = os.path.join(self._session_path, instance_id)
        instance = Instance(self, instance_path, instance_id, self._settings)
        instance.analyses.add_options_changed_listener(self._options_changed_handler)
        self[instance_id] = instance
        self._notify_session_event(SessionEvent.Type.INSTANCE_STARTED, instance_id)
        return instance

    async def restart_engines(self):
        await self._runner.restart_engines()

    def rerun_analyses(self):
        for analysis in self._analyses:
            if analysis.enabled:
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
        main_settings = self._settings.group('main').get('updateStatus', 'na')

    @property
    def session_path(self):
        return self._session_path

    def set_update_status(self, status):

        main_settings = self._settings.group('main')
        main_settings.set('updateStatus', status)
        self.notify_global_changes()

        if status == 'available':
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
            TIME_LIMIT = conf.get('time_limit', '')
            TIME_LIMIT = int(TIME_LIMIT)
        except Exception:
            TIME_LIMIT = None

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
            TIMEOUT_IDLE_NOTICE = 300

        now = monotonic()

        session_start_time = now
        session_no_connection_since = now
        session_no_connection_unclean = False
        session_idle_since = now
        idle_warning_since = None
        last_idle_warning = None
        last_time_limit_warning = None

        self._running = True

        get_notif_task = create_task(self._runner.notifications().get())

        try:
            while self._running:

                done, _ = await wait({ get_notif_task }, timeout=1)
                if not self._running:
                    break
                if get_notif_task in done:
                    notif = get_notif_task.result()
                    self._notify(notif)
                    get_notif_task = create_task(self._runner.notifications().get())

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
                        log.info('ending session: idle')
                        self.stop()

                # now determine, notify, or end the session if the idle
                # criteria has been met
                idle_for = now - session_idle_since

                if TIMEOUT_IDLE == 0:
                    # do nothing
                    pass
                elif idle_for > TIMEOUT_IDLE:
                    log.info('ending session: idle')
                    self.stop()
                elif idle_for > (TIMEOUT_IDLE - TIMEOUT_IDLE_NOTICE):
                    # notify session is idle
                    if idle_warning_since is None:
                        idle_warning_since = now
                        notif = SessionShutdownIdleNotification(shutdown_in=TIMEOUT_IDLE - idle_for)
                        self._notify(notif)
                        last_idle_warning = now
                    elif now - last_idle_warning > 30:
                        notif = SessionShutdownIdleNotification(shutdown_in=TIMEOUT_IDLE - idle_for)
                        self._notify(notif)
                        last_idle_warning += 30
                else:
                    if idle_warning_since is not None:
                        # clear notification
                        notif = SessionShutdownIdleNotification().dismiss()
                        self._notify(notif)
                        idle_warning_since = None
                        last_idle_warning = None

                if TIME_LIMIT and now - session_start_time > TIME_LIMIT - TIMEOUT_IDLE_NOTICE:
                    if now - session_start_time > TIME_LIMIT:
                        log.info('ending session: exceeded time limit')
                        self.stop()
                    elif last_time_limit_warning is None:
                        shutdown_in = TIME_LIMIT - (now - session_start_time)
                        notif = SessionShutdownTimeLimitNotification(shutdown_in=shutdown_in)
                        self._notify(notif)
                        last_time_limit_warning = now
                    elif now - last_time_limit_warning > 30:
                        shutdown_in = TIME_LIMIT - (now - session_start_time)
                        notif = SessionShutdownTimeLimitNotification(shutdown_in=shutdown_in)
                        self._notify(notif)
                        last_time_limit_warning += 30
        finally:
            if self._settings is not None:
                try:
                    await self._settings.flush()
                except Exception as e:
                    log.exception(e)
            self._ended.set()

    async def wait_ended(self):
        await self._ended.wait()

    def _notify(self, notification):
        for instance in self.values():
            instance.notify(notification)


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
