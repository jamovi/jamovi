#
# Copyright (C) 2016 Jonathon Love
#

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType
from jamovi.core import Dirs
from jamovi.core import DataSet

from . import jamovi_pb2 as jcoms

from .utils import conf
from .utils import FileEntry
from .utils import ssl_context
from .utils.stream import ProgressStream
from .datasetmodel import DataSetModel
from .datasetcontroller import DataSetController
from .datasetcontroller import ForbiddenOp
from .project import Project
from . import formatio
from .permissions import Permissions
from .sessionfiles import SessionFiles

from .exceptions import FileExistsException
from .exceptions import UserException

from .syncs import create_file_sync
from .syncs import HttpSync
from .syncs import HttpSyncFileInfo

import os
import os.path
import platform
import posixpath
import logging
import asyncio
import functools
from time import monotonic
from urllib import parse

from aiohttp import ClientSession
from aiohttp import TCPConnector
from ipaddress import ip_address

from asyncio import ensure_future as create_task
from asyncio import wait

from collections import namedtuple

from tempfile import NamedTemporaryFile
from tempfile import mktemp
from tempfile import mkstemp

from .dataset import StoreFactory

from .utils import fs
from .utils import is_url
from .utils import latexify
from .i18n import _


log = logging.getLogger(__name__)

ConnectionStatus = namedtuple('ConnectionStatus',
                              ('connected', 'inactive_since', 'unclean', 'virgin'),
                              defaults=(True, None, False, False))


class Instance:

    _file_sync_client: ClientSession

    def __init__(self, session, instance_path, instance_id, settings):

        self._session = session
        self._instance_path = instance_path
        self._instance_id = instance_id
        self._settings = settings

        self._file_sync_client = None

        os.makedirs(self._instance_path, exist_ok=True)
        os.makedirs(self.temp_path(), exist_ok=True)
        self._buffer_path = posixpath.join(instance_path, 'buffer')

        self._coms = None
        self._perms = Permissions.retrieve()

        self._project = Project(self)
        self._controllers: dict[int, DataSetController] = { }

        now = monotonic()

        self._virgin = True
        self._idle_since = now
        self._no_connection_since = now
        self._no_connection_unclean_disconnect = False
        self._last_autosaved = now
        self._autosaving = False
        self._edit_started: float | None = None

        self._project.analyses.add_results_changed_listener(self._on_results)
        self._project.analyses.add_output_received_listener(self._on_output_received)
        self._project.analyses.weights_changed += self._on_weights_changed

        self._session.modules.add_listener(self._module_event)

        handler = Instance.LogHandler(self)
        handler.setLevel('DEBUG')
        self._log = logging.getLogger(instance_id)
        self._log.propagate = False
        self._log.setLevel('DEBUG')
        self._log.addHandler(handler)

        main_settings = self._settings.group('main')
        main_settings.changed += self._main_settings_changed

    @property
    def id(self):
        return self._instance_id

    @property
    def session(self):
        return self._session

    @property
    def project(self) -> Project:
        return self._project

    @property
    def log(self):
        return self._log

    def create_store(self):
        """Create the backing store for a data set. The engine expects to
        find it at {instance}/buffer."""
        return StoreFactory.create(self._buffer_path, 'shmem')

    def _sync_controllers(self):
        """Create controllers for data sets which don't have one yet (the
        file readers add data sets to the project directly)."""
        for dataset in self._project.datasets:
            if dataset.id not in self._controllers:
                dataset.set_log(self._log)
                self._controllers[dataset.id] = DataSetController(self, dataset)

    def _remove_all_datasets(self):
        self._controllers = { }
        for id in self._project.dataset_ids:
            self._project.remove_dataset(id)

    def _controller(self, dataset_id: int = 0) -> DataSetController:
        """The controller for a data set (0 means the first data set)."""
        if dataset_id == 0:
            return next(iter(self._controllers.values()))
        return self._controllers[dataset_id]

    def _normalise_path(self, path):

        if path.startswith('{{Temp}}'):
            base = os.path.basename(path)
            base, ext = os.path.splitext(base)
            temp_path = self.temp_path()
            os.makedirs(temp_path, exist_ok=True)
            nor_path = mktemp(suffix=ext, dir=temp_path)
        elif path.startswith('{{SessionTemp}}'):
            # these are written by the engine (i.e. 'action' results) and
            # opened by the client, so guard against directory traversal
            session_temp = os.path.normpath(self._session.session_temp)
            nor_path = os.path.normpath(path.replace('{{SessionTemp}}', session_temp, 1))
            if os.path.commonpath([session_temp, nor_path]) != session_temp:
                raise PermissionError()
        elif path.startswith('{{Documents}}'):
            nor_path = path.replace('{{Documents}}', Dirs.documents_dir())
        elif path.startswith('{{Downloads}}'):
            nor_path = path.replace('{{Downloads}}', Dirs.downloads_dir())
        elif path.startswith('{{Desktop}}'):
            nor_path = path.replace('{{Desktop}}', Dirs.desktop_dir())
        elif path.startswith('{{Home}}'):
            nor_path = path.replace('{{Home}}', Dirs.home_dir())
        elif path.startswith('{{Examples}}'):
            modules = self._session.modules
            if path == '{{Examples}}':
                module = modules['jmv']
                nor_path = posixpath.join(module.path, 'data')
            else:
                if os.path.dirname(path) == '{{Examples}}':
                    module_name = 'jmv'
                else:
                    module_name = os.path.basename(os.path.dirname(path))
                # {{Examples}}/module_name/[file_name.ext]
                file_name = os.path.basename(path)
                try:
                    module = modules[module_name]
                    nor_path = posixpath.join(module.path, 'data', file_name)
                except KeyError:
                    # return something default-y, let somewhere else error
                    module = modules['jmv']
                    nor_path = posixpath.join(module.path, 'data')
        else:
            nor_path = path

        return nor_path

    def temp_path(self):
        return posixpath.join(self._instance_path, 'dl')

    @property
    def perms(self):
        return self._perms

    @property
    def session_files(self) -> SessionFiles:
        # files for 'File' analysis options, in the session temp dir
        return SessionFiles(self._session.session_temp)

    def file_storage_headroom(self) -> float | None:
        # how many more bytes the session temp dir may take, or None if
        # it isn't capped
        limit = self._perms.files.maxStorage
        if limit == float('inf'):
            return None
        return max(0, limit - self.session_files.usage())

    def check_file_storage(self, extra: int):
        # raises if adding extra bytes to the session temp dir would take it
        # over the cap (c.f. DataSetModel._check_perms)
        headroom = self.file_storage_headroom()
        if headroom is not None and extra > headroom:
            raise PermissionError(self.file_storage_message())

    def file_storage_message(self) -> str:
        limit = self._perms.files.maxStorage
        return _('This session is limited to {} MB of files').format(int(limit // (1024 * 1024)))

    def _virtualise_path(self, path):

        temp_path = self.temp_path()
        if path.startswith(temp_path):
            return path.replace(temp_path, '{{Temp}}')

        try:
            documents_dir = Dirs.documents_dir()
            if path.startswith(documents_dir):
                return path.replace(documents_dir, '{{Documents}}')
        except Exception:
            pass

        try:
            downloads_dir = Dirs.downloads_dir()
            if path.startswith(downloads_dir):
                return path.replace(downloads_dir, '{{Downloads}}')
        except Exception:
            pass

        try:
            desktop_dir = Dirs.desktop_dir()
            if path.startswith(desktop_dir):
                return path.replace(desktop_dir, '{{Desktop}}')
        except Exception:
            pass

        try:
            home_dir = Dirs.home_dir()
            if path.startswith(home_dir):
                return path.replace(home_dir, '{{Home}}')
        except Exception:
            pass

        return path

    def _module_event(self, event):
        if event['type'] == 'moduleUpdated':
            module_name = event['data']['name']

            broadcast = jcoms.ModuleRR()
            broadcast.command = jcoms.ModuleRR.ModuleCommand.Value('INSTALL')
            broadcast.name = module_name

            if self._coms is not None:
                self._coms.send(broadcast, self._instance_id)

    @property
    def instance_path(self):
        return self._instance_path

    def set_coms(self, coms):
        if self._coms is not None:
            self._coms.remove_close_listener(self._close)
        self._coms = coms
        self._coms.add_close_listener(self._close)
        self._no_connection_since = None
        self._virgin = False

    def close(self):
        self._session.modules.remove_listener(self._module_event)
        self._controllers = { }
        self._project.close()

    def _close(self, clean=True):
        log.debug('instance %s: connection closed (clean=%s)', self._instance_id, clean)
        self._coms.remove_close_listener(self._close)
        self._coms = None
        self._no_connection_unclean_disconnect = not clean
        self._no_connection_since = monotonic()

    @property
    def is_active(self):
        return self._coms is not None

    def connection_status(self):
        if self._no_connection_since is None:
            return ConnectionStatus()
        else:
            return ConnectionStatus(False,
                                    self._no_connection_since,
                                    self._no_connection_unclean_disconnect,
                                    self._virgin)

    def idle_for(self):
        return monotonic() - self._idle_since

    def idle_since(self):
        return self._idle_since

    def notify(self, notification):
        if self._coms is not None:
            self._coms.send(notification.as_pb())

    @property
    def analyses(self):
        return self._project.analyses

    def get_path_to_resource(self, resourceId):
        return posixpath.join(self._instance_path, resourceId)

    async def on_request(self, request):

        self._idle_since = monotonic()

        if type(request) == jcoms.DataSetRR:
            await self._on_dataset(request)
        elif type(request) == jcoms.OpenRequest:
            await self._on_open(request)
        elif type(request) == jcoms.InfoRequest:
            self._on_info(request)
        elif type(request) == jcoms.SettingsRequest:
            self._on_settings(request)
        elif type(request) == jcoms.AnalysisRequest:
            await self._on_analysis(request)
        elif type(request) == jcoms.FSRequest:
            self._on_fs_request(request)
        elif type(request) == jcoms.ModuleRR:
            await self._on_module(request)
        elif type(request) == jcoms.StoreRequest:
            await self._on_store(request)
        else:
            log.info('unrecognised request')
            log.info(request.payloadType)

    async def _on_dataset(self, request):

        if not self._project.has_datasets:
            return

        try:
            controller = self._controller()
            response = await controller.handle(request)
            self._coms.send(response, self._instance_id, request)

        except ForbiddenOp as e:
            self._coms.send_error(e.operation, str(e), self._instance_id, request)
        except TypeError as e:
            self._coms.send_error(_('Could not assign data'), str(e), self._instance_id, request)
        except Exception as e:
            log.exception(e)
            self._coms.send_error(_('Could not perform operation'), str(e), self._instance_id, request)

    def update_analyses(self, dataset, changed=set(), renamed=set(), rows_added_removed=False, filters_changed=False, weights_changed=False):
        """Notify the analyses bound to a data set that it has changed."""

        if rows_added_removed or filters_changed or weights_changed:
            changed = set(map(lambda x: x.name, dataset))

        for analysis in self._project.analyses:
            using = analysis.get_using()
            using_and_changed = using & changed
            if not using.isdisjoint(renamed):
                analysis.notify_changes(using_and_changed, renamed)
            elif using_and_changed:
                analysis.notify_changes(using_and_changed)
            else:
                # analysis uses no columns, but does create some
                # so we should rerun it so it can recreate
                if rows_added_removed and analysis.get_producing():
                    analysis.notify_changes([])

    def _on_results(self, analysis):
        if self._coms is not None:
            self._coms.send(analysis.results, self._instance_id, complete=analysis.complete)

    def _on_output_received(self, analysis, outputs):

        def gen_output_column_name(desired_name):
            name = desired_name
            next_number = 2
            while True:
                # create a unique name if necessary
                for column in dataset:
                    if name == column.name:  # not unique!
                        name = f'{ desired_name } ({ next_number })'
                        next_number += 1
                        break
                else:
                    # it's unique, phew!
                    break
            return name

        changed = set()
        renamed = dict()
        rows_added_removed = False

        dataset = analysis.dataset
        controller = self._controllers[dataset.id]

        try:
            response = None
            analysis_id = outputs.analysis_id

            for option_outputs in outputs.outputs:
                option_name = option_outputs.option_name

                columns_by_output_name = { }
                to_delete = [ ]

                for column in dataset:
                    if (column.column_type is ColumnType.OUTPUT
                            and column.output_analysis_id == analysis_id
                            and column.output_option_name == option_name):
                        columns_by_output_name[column.output_name] = column

                new_names = list(map(lambda x: x.name, option_outputs.outputs))

                # determine columns to delete

                for column in list(columns_by_output_name.values()):  # make a copy so we can modify the original
                    if column.output_name not in new_names:
                        del columns_by_output_name[column.output_name]
                        to_delete.append(column)

                # add new columns

                final_names = [ ]

                for output in option_outputs.outputs:

                    desired_name = output.title

                    if output.name not in columns_by_output_name.keys():

                        name = gen_output_column_name(desired_name)

                        column = dataset.insert_column(dataset.column_count, name)
                        column.column_type = ColumnType.OUTPUT
                        column.description = output.description
                        column.output_analysis_id = analysis_id
                        column.output_option_name = option_name
                        column.output_name = output.name
                        column.output_assigned_column_name = name
                        column.output_desired_column_name = desired_name
                        column.output_assigned_column_description = output.description
                    else:
                        column = columns_by_output_name[output.name]
                        if column.name == column.output_assigned_column_name:  # user hasn't changed the name
                            if column.output_desired_column_name != desired_name:  # but analysis has changed the name
                                name = gen_output_column_name(desired_name)
                                renamed[column.name] = name
                                column.name = name
                                column.description = output.description
                                column.output_assigned_column_name = name
                                column.output_desired_column_name = desired_name
                                column.output_assigned_column_description = output.description

                        if (column.description == column.output_assigned_column_description
                                and column.description != output.description):
                            column.description = output.description
                            column.output_assigned_column_description = output.description

                    final_names.append(column.name)

                    if output.values is None:
                        if output.measure_type != column.measure_type:
                            column.clear()
                            column.change(measure_type=output.measure_type)
                            changed.add(column.name)
                    elif len(output.values) == 0:
                        column.clear()
                        column.change(measure_type=output.measure_type)
                        changed.add(column.name)
                    elif isinstance(output.values[0], int):
                        column.clear()
                        column.change(data_type=DataType.INTEGER, measure_type=output.measure_type)
                        if output.measure_type is not MeasureType.CONTINUOUS:
                            for level in output.levels:
                                column.append_level(level.value, level.label)
                        changed.add(column.name)
                    elif isinstance(output.values[0], float):
                        if column.data_type is not DataType.DECIMAL or column.measure_type is not MeasureType.CONTINUOUS:
                            column.change(data_type=DataType.DECIMAL, measure_type=MeasureType.CONTINUOUS)
                            changed.add(column.name)
                    else:
                        # shouldn't get here
                        continue

                    if output.values:
                        index = 0
                        n_values = len(output.values)
                        if n_values > dataset.row_count:
                            dataset.set_row_count(n_values)
                            dataset.refresh_filter_state()
                            rows_added_removed = True
                        for row_no in range(column.row_count):
                            if index < n_values:
                                value = output.values[index]
                                column.set_value(row_no, value)
                                index += 1
                            else:
                                column.clear_at(row_no)

                        if column.data_type == DataType.DECIMAL:
                            column.determine_dps()

                        changed.add(column.name)

                    if response is None:
                        response = jcoms.DataSetRR()

                    column_pb = response.schema.columns.add()
                    controller.populate_column_schema(column, column_pb, True)
                    column_pb.dataChanged = True

                option_value = analysis.options.get_value(option_name)
                if option_value is not None:
                    option_value['vars'] = final_names
                analysis.options.set_value(option_name, option_value)

                # delete columns

                for column in to_delete:
                    changed.add(column.name)

                    if response is None:
                        response = jcoms.DataSetRR()

                    dataset.delete_columns_by_id([column.id])
                    column_pb = response.schema.columns.add()
                    column_pb.id = column.id
                    column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')

            if self._coms is not None and response is not None:
                controller.populate_schema_info(None, response)
                self._coms.send(response, self._instance_id)

            self.update_analyses(dataset, changed=changed, renamed=renamed, rows_added_removed=rows_added_removed)

        except Exception as e:
            log.exception(e)

    def _on_weights_changed(self, event):
        weights_column_name = event.data['weights']
        dataset = event.source.dataset
        dataset.set_weights_by_name(weights_column_name)
        self.update_analyses(dataset, weights_changed=True)

    def _on_fs_request(self, request):
        try:
            path = request.path
            extensions = request.extensions

            abs_path = path  # used by exception reporting

            try:
                if path != '':
                    path = self._virtualise_path(path)
                    abs_path = self._normalise_path(path)
                else:
                    path = '{{Documents}}'
                    abs_path = Dirs.documents_dir()
                    if os.path.exists(abs_path):
                        path = '{{Documents}}'
                    else:
                        path = '{{Root}}'
            except BaseException:
                path = '{{Root}}'
                abs_path = '/'

            response = jcoms.FSResponse()
            response.path = path
            response.osPath = abs_path

            if path.startswith('{{Root}}'):

                if self._perms.browse.local is False:
                    raise PermissionError()

                try:
                    if os.path.exists(Dirs.documents_dir()):
                        entry = response.contents.add()
                        entry.name = _('Documents')
                        entry.path = '{{Documents}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                try:
                    if os.path.exists(Dirs.downloads_dir()):
                        entry = response.contents.add()
                        entry.name = _('Downloads')
                        entry.path = '{{Downloads}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                try:
                    if os.path.exists(Dirs.desktop_dir()):
                        entry = response.contents.add()
                        entry.name = _('Desktop')
                        entry.path = '{{Desktop}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                try:
                    if os.path.exists(Dirs.home_dir()):
                        entry = response.contents.add()
                        entry.name = _('Home')
                        entry.path = '{{Home}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                if platform.uname().system == 'Windows':
                    for drive_letter in range(ord('A'), ord('Z') + 1):
                        drive = chr(drive_letter) + ':'
                        if os.path.exists(drive):
                            entry = response.contents.add()
                            entry.name = drive
                            entry.path = drive
                            entry.type = jcoms.FSEntry.Type.Value('DRIVE')
                else:
                    entry = response.contents.add()
                    entry.name = '/'
                    entry.path = '/'
                    entry.type = jcoms.FSEntry.Type.Value('FOLDER')

                self._coms.send(response, self._instance_id, request)

            elif path.startswith('{{Examples}}'):

                if self._perms.browse.examples is False:
                    raise PermissionError()

                if path == '{{Examples}}' or path == '{{Examples}}/':
                    for module in self._session.modules:
                        if module.datasets:
                            if module.name == 'jmv':
                                for dataset in module.datasets:
                                    entry = response.contents.add()
                                    entry.name = dataset.name
                                    entry.path = posixpath.join('{{Examples}}', 'jmv', dataset.path)
                                    entry.description = dataset.description
                                    entry.tags[:] = dataset.tags
                                    entry.isExample = True
                            else:
                                entry = response.contents.add()
                                entry.name = module.name
                                entry.path = posixpath.join('{{Examples}}', module.name)
                                entry.type = jcoms.FSEntry.Type.Value('FOLDER')
                                entry.description = module.title
                                if module.datasets_license:
                                    entry.license = module.datasets_license.name
                                    entry.licenseUrl = module.datasets_license.url
                else:
                    module_name = os.path.basename(path)
                    modules = self._session.modules
                    try:
                        module = modules[module_name]
                        if module.datasets:
                            for dataset in module.datasets:
                                entry = response.contents.add()
                                entry.name = dataset.name
                                entry.path = posixpath.join('{{Examples}}', module_name, dataset.path)
                                entry.description = dataset.description
                                entry.tags[:] = dataset.tags
                                entry.isExample = True
                    except KeyError:
                        pass

                self._coms.send(response, self._instance_id, request)

            else:
                if self._perms.browse.local is False:
                    raise PermissionError()

                entries = [ ]

                for direntry in os.scandir(abs_path + '/'):  # add a / in case we get C:

                    show = False
                    if fs.is_hidden(direntry.path):
                        show = False
                    elif direntry.is_dir():
                        entry_type = FileEntry.Type.FOLDER
                        if fs.is_link(direntry.path):
                            show = False
                        else:
                            show = True
                    else:
                        entry_type = FileEntry.Type.FILE
                        if len(extensions) == 0:
                            show = True
                        else:
                            filename = os.path.basename(direntry.name)
                            name, ext = os.path.splitext(filename)
                            if ext != '' and ext[1:] in extensions:
                                show = True

                    if show:
                        entry = FileEntry()
                        entry.name = direntry.name
                        entry.type = entry_type
                        entry.path = posixpath.join(path, direntry.name)
                        entries.append(entry)

                entries = sorted(entries)

                for entry in entries:

                    entry_type = jcoms.FSEntry.Type.Value('FILE')
                    if entry.type is FileEntry.Type.FOLDER:
                        entry_type = jcoms.FSEntry.Type.Value('FOLDER')

                    entry_pb = response.contents.add()
                    entry_pb.name = entry.name
                    entry_pb.type = entry_type
                    entry_pb.path = entry.path

                self._coms.send(response, self._instance_id, request)

        except PermissionError as e:
            log.exception(e)
            base    = os.path.basename(abs_path)
            message = _('Unable to browse {}').format(base)
            cause = str(e)
            if cause == '':
                cause = _('Access is denied. You may not have the appropriate permissions to access this resource.')
            self._coms.send_error(message, cause, self._instance_id, request)
        except OSError as e:
            base    = os.path.basename(abs_path)
            message = _('Unable to browse {}').format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)
        except BaseException as e:
            base    = os.path.basename(abs_path)
            message = _('Unable to browse {}').format(base)
            cause = str(e)
            self._coms.send_error(message, cause, self._instance_id, request)

    @property
    def file_sync_client(self):

        class BlockLocalConnector(TCPConnector):
            # block connections to the local network (security!)
            async def _resolve_host(self, host: str, port: int, traces=None):
                resolved_list = await super()._resolve_host(host, port, traces)
                for resolved in resolved_list:
                    if not ip_address(resolved['host']).is_global:
                        raise PermissionError
                return resolved_list

        if self._file_sync_client is None:
            self._file_sync_client = ClientSession(
                raise_for_status=True,
                connector=BlockLocalConnector(ssl=ssl_context()),
            )

        return self._file_sync_client


    def save(self, options):
        stream = ProgressStream()
        create_task(self._save(options, stream))
        return stream

    def needs_autosave(self) -> bool:
        return (self._project.is_edited
                and not self._project.is_blank
                and self._project.path != ''
                and self._project.save_format == 'jamovi')

    async def autosave(self):
        if self._autosaving or not self.needs_autosave():
            return
        self._autosaving = True
        try:
            await self.save({'path': self._project.path, 'overwrite': True})
            self._last_autosaved = monotonic()
            log.info('autosaved: %s', self._project.title[:16])
        finally:
            self._autosaving = False

    async def _save(self, options, return_stream):

        path = options['path']
        trigger_download = False
        staging_path = None  # temp file when saving through a file sync

        try:

            if (self._project.file_sync is not None and
                    self._project.file_sync.matches(path)):
                file_sync = self._project.file_sync
            elif is_url(path):
                file_sync = create_file_sync(path, options, self.file_sync_client)
            else:
                file_sync = None

            if file_sync:
                with NamedTemporaryFile(suffix='.omv', delete=False) as file:
                    path = file.name
                staging_path = path
                file_exists = False
            else:
                if path.startswith('{{Temp}}'):
                    if self._perms.save.download is False:
                        raise PermissionError()
                    trigger_download = True
                else:
                    if self._perms.save.local is False:
                        raise PermissionError()

                path = self._normalise_path(path)
                file_exists = os.path.isfile(path)

            if file_exists and not options.get('overwrite', False):
                raise FileExistsException

            content = options.get('content')
            part = options.get('part')

            multiplier = 1000
            if file_sync:
                # if we're uploading, the save process represents
                # only half of the total operation. (uploading is
                # the second half)
                multiplier = 500

            if (not path.endswith('.omv')) and (content is not None) and (not file_sync):
                stream = self._on_save_content(path, content)
                is_export = True
            elif part is not None:
                stream = self._on_save_part(path, part)
                is_export = True
            else:
                is_export = options.get('export', False)
                if 'svgs' in options:
                    self.analyses.set_svgs(options['svgs'])
                stream = self._on_save_everything(path, content, is_export)

            async for progress in stream:
                return_stream.write((progress * multiplier, 1000))

            if file_sync:
                stat_info = os.stat(path)
                file_size = stat_info.st_size

                with open(path, 'rb') as file:
                    overwrite = options.get('overwrite', False)
                    stream = file_sync.write(file, file_size, overwrite)
                    async for progress in stream:
                        return_stream.write((multiplier + progress * multiplier, 1000))
                    file_info: HttpSyncFileInfo = await stream

                path = file_info.url
                filename = file_info.filename
            else:
                path = self._virtualise_path(path)
                filename = os.path.basename(path)

            title, __ = os.path.splitext(filename)

            result = { 'path': path, 'filename': filename, 'title': title }

            if not is_export:
                self._project.title = title
                self._project.path = path
                self._project.save_format = 'jamovi'
                self._project.is_edited = False
                self._project.file_sync = file_sync

                self._add_to_recents(path, self._project.title)

                result['saveFormat'] = self._project.save_format

            if trigger_download:
                result['download'] = True

            return_stream.set_result(result)

        except FileExistsException as e:
            return_stream.set_exception(e)

        except Exception as e:

            log.exception(e)

            base    = os.path.basename(path)
            message = _('Unable to save {}').format(base)
            cause = None

            if isinstance(e, PermissionError):
                cause = str(e)
                if cause == '':
                    cause = _('Access is denied. You may not have the appropriate permissions to access this resource.')
            elif isinstance(e, OSError):
                if e.strerror:
                    cause = e.strerror
                else:
                    cause = str(e)
            else:
                cause = str(e)

            return_stream.set_exception(UserException(message, cause))

        finally:
            if staging_path is not None:
                try:
                    os.remove(staging_path)
                except OSError as e:
                    log.warning("unable to remove '%s': %s", staging_path, e)

    async def _on_save_content(self, path, content):

        yield 0

        if path.endswith('.zip'):  # latex bundle export

            async def resolve_image(part):
                ext = '.pdf'

                id, address = part.split('/', maxsplit=1)
                id = int(id)

                fd, temp_file_path = mkstemp(suffix=ext)
                temp_file_path = temp_file_path.replace('\\', '/')

                analysis = self.analyses.get(id)
                await analysis.save(temp_file_path, address)

                return temp_file_path

            with open(path, 'wb') as file:
                content = content.decode('utf-8')
                async for progress in latexify(content, file, resolve_image):
                    yield progress

        else:
            with open(path, 'wb') as file:
                file.write(content)

    async def _on_save_everything(self, path, content, is_export):

        yield 0

        ioloop = asyncio.get_event_loop()
        events = asyncio.Queue(1)

        def add_to_event_queue(p):
            if events.full():
                events.get_nowait()  # discard
            events.put_nowait(p)

        def prog_cb(p):
            ioloop.call_soon_threadsafe(add_to_event_queue, p)

        async with self._project.attach(read_only=True):
            save_task = create_task(ioloop.run_in_executor(None, formatio.write, self._project, path, prog_cb, content))
            retrieve_event_task = create_task(events.get())
            pending = (retrieve_event_task, save_task)

            while True:
                done, pending = await wait(pending, return_when=asyncio.FIRST_COMPLETED)
                if save_task in done:
                    break
                yield retrieve_event_task.result()
                retrieve_event_task = create_task(events.get())
                pending = (retrieve_event_task, save_task)

            for task in pending:
                task.cancel()

        save_task.result()  # throw if necessary


    async def _on_save_part(self, path, part):

        yield 0

        segments = part.split('/')
        analysisId = int(segments[0])
        address = '/'.join(segments[1:])

        analysis = self.analyses.get(analysisId)

        if analysis is not None:
            await analysis.save(path, address)
        else:
            raise Exception(_('Unable to access analysis'))

    def open(self, path, title=None, is_temp=False, ext=None, options=None, remove_after=False):
        # remove_after: the file at path is ours (i.e. an upload written to a
        # temp file) and should be removed once it's been read

        if options is None:
            options = { }

        is_example = path.startswith('{{Examples}}')
        is_session_temp = path.startswith('{{SessionTemp}}')
        if is_example or is_session_temp:
            is_temp = True  # don't add to recents, etc.
        if is_session_temp:
            remove_after = True  # one-shot file produced by an analysis 'action'

        if path == '':
            pass
        elif is_example:
            if self._perms.open.examples is False:
                raise PermissionError()
        elif is_session_temp:
            # a data set produced by an analysis (an 'action' result);
            # it lives in the session temp, not the upload sandbox
            pass
        elif is_url(path):
            if self._perms.open.remote is False:
                raise PermissionError()
        else:
            # either an upload or opening a local file
            if self._perms.open.upload is False:
                raise PermissionError()
            if self._perms.open.local is False:
                temp_dir = conf.get('upload_path', None)
                # prevent directory traversal attacks
                if temp_dir is None:
                    raise PermissionError()
                path = os.path.join(temp_dir, path)
                if os.path.commonpath([temp_dir, path]) != temp_dir:
                    raise PermissionError()

        log_title = title or os.path.splitext(os.path.basename(path))[0]
        if len(log_title) > 16:
            log_title = log_title[:16] + '...'
        log.info("opening '%s'", log_title)

        stream = ProgressStream()

        async def read_file(path, is_temp, stream):

            nonlocal title
            nonlocal ext
            nonlocal remove_after

            file_sync: HttpSync | None = None
            norm_path = None

            try:
                url = None

                if is_url(path):

                    url = path
                    file_sync = create_file_sync(url, options, self.file_sync_client)

                    read_stream = file_sync.read()
                    async for progress in read_stream:
                        progress_to_50 = (500 * progress, 1000)
                        stream.write(progress_to_50)

                    file_info = await read_stream

                    # the sync downloads into a temp file, which we own
                    norm_path = file_info.url
                    remove_after = True
                    title, __ = os.path.splitext(file_info.filename)
                    ext = file_info.ext

                    if ext == 'omv' and not file_sync.read_only:
                        is_temp = False

                else:
                    norm_path = self._normalise_path(path)

                # opening replaces any data sets already here
                self._remove_all_datasets()

                ioloop = asyncio.get_event_loop()

                def prog_cb(p):
                    if url:  # downloaded
                        progress = (500 + 500 * p, 1000)
                    else:
                        progress = (1000 * p, 1000)
                    ioloop.call_soon_threadsafe(stream.write, progress)

                main_settings = self._settings.group('main')
                func = functools.partial(formatio.read, self._project, norm_path, prog_cb, main_settings, is_temp=is_temp, title=title, ext=ext)
                async with self._project.attach():
                    result = await ioloop.run_in_executor(None, func)

                self._sync_controllers()

                if file_sync is not None:
                    self._project.file_sync = file_sync
                    self._project.path = url

                stream.set_result(result)

                if self._project.analyses.count() == 0 or self._project.analyses._analyses[0].name != 'empty':
                    annotation = self._project.analyses.create_annotation(0)
                    annotation.results.index = 1
                    annotation.results.title = _('Results')

                i = 1
                while i < self._project.analyses.count():
                    analysis = self._project.analyses._analyses[i]

                    if analysis.name == 'empty':
                        log.info(f'Missing Analysis: { analysis.depends_on }')
                        del self._project.analyses[analysis.id]
                    else:
                        annotation_index = i + 1
                        if annotation_index == self._project.analyses.count():
                            annotation = self._project.analyses.create_annotation(annotation_index)
                            annotation.results.index = annotation_index + 1
                            analysis.add_dependent(annotation)
                        else:
                            annotation = self._project.analyses._analyses[annotation_index]
                            if annotation.name != 'empty' or annotation.depends_on != analysis.id:
                                if annotation.name == 'empty':
                                    log.info(f'Dependency miss-match: { annotation.depends_on }, { analysis.id }')
                                    del self._project.analyses[annotation.id]
                                else:
                                    log.info(f'Missing Annotation: { analysis.id }')
                                annotation = self._project.analyses.create_annotation(annotation_index)
                                annotation.results.index = annotation_index + 1
                                analysis.add_dependent(annotation)
                        i = annotation_index + 1

            except Exception as e:
                if not isinstance(e, formatio.FileReadError):
                    log.exception(e)
                self._remove_all_datasets()
                stream.set_exception(e)
            else:
                # success
                if path != '' and not is_temp:
                    self._add_to_recents(path, self._project.title)
            finally:
                if remove_after and norm_path is not None:
                    # whether the open succeeded or not, the file isn't
                    # needed any more
                    try:
                        os.remove(norm_path)
                    except OSError as e:
                        log.warning("unable to remove '%s': %s", norm_path, e)

        create_task(read_file(path, is_temp, stream))
        return stream

    async def _on_open(self, request):

        if request.op == jcoms.OpenRequest.Op.Value('IMPORT_REPLACE'):
            await self._on_import(request)

    async def _on_import(self, request):

        if request.filePath != '':
            paths = [ request.filePath ]
        else:
            paths = list(request.filePaths)

        n_files = len(paths)
        coms = self._coms
        instance_id = self._instance_id
        instance = self

        # class which provides an iterator which iterates over the data sets
        class MultipleDataSets:

            # python 3.6 allows you use to use 'yield' inside async iterators.
            # unfortunately, we're maintaining compatibility with 3.5, so we
            # have to do all this bollocks instead:

            def __init__(self, paths):
                self._paths = paths
                self._i = 0
                self._mm = None

                if os.name == 'nt':
                    self._buffer_path = None
                else:
                    self._buffer_path = NamedTemporaryFile(delete=False).name

            def __del__(self):
                if self._mm is not None:
                    self._mm.close()
                self._del_buffer()

            def _del_buffer(self):
                if self._buffer_path is not None:
                    try:
                        os.remove(self._buffer_path)
                    except Exception:
                        pass
                    self._buffer_path = None

            def __aiter__(self):
                return self

            async def __anext__(self):

                if os.name == 'nt':
                    self._del_buffer()
                    self._buffer_path = mktemp()

                if self._i >= len(self._paths):
                    raise StopAsyncIteration()

                path = self._paths[self._i]

                norm_path = instance._normalise_path(path)
                name, __ = os.path.splitext(os.path.basename(path))

                model = DataSetModel()
                model.set_log(instance.log)

                if self._mm is not None:
                    self._mm.close()

                assert self._buffer_path is not None

                self._mm = StoreFactory.create(self._buffer_path, 'shmem')
                model.dataset = self._mm.create_dataset()

                ioloop = asyncio.get_event_loop()

                def prog_cb(p):
                    ioloop.call_soon_threadsafe(
                        functools.partial(
                            coms.send, None, instance_id, request,
                            complete=False, progress=(1000 * (self._i + p) / n_files, 1000)))

                main_settings = instance._settings.group('main')
                func = functools.partial(formatio.read_dataset, model, norm_path, prog_cb, main_settings)
                async with model.attach():
                    await ioloop.run_in_executor(None, func)

                self._i += 1
                return (name, model)

        try:
            if self._perms.open.local is False:
                raise PermissionError()

            controller = self._controller()
            datasets = MultipleDataSets(paths)
            await controller.dataset.import_from(datasets, n_files > 1)
            controller.mod_tracker.clear()

            response = jcoms.OpenProgress()
            self._coms.send(response, self._instance_id, request)

        except PermissionError as e:
            log.exception(e)
            base = ''
            if e.filename is not None:
                base = os.path.basename(e.filename)
            message = _('Unable to import {}').format(base)
            cause = str(e)
            if cause == '':
                cause = _('Access is denied. You may not have the appropriate permissions to access this resource.')
            self._coms.send_error(message, cause, self._instance_id, request)

        except OSError as e:
            log.exception(e)
            base = ''
            if e.filename is not None:
                base = os.path.basename(e.filename)
            message = _('Unable to import {}').format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)

        except Exception as e:
            log.exception(e)
            message = _('Unable to perform import')
            cause = str(e)
            self._coms.send_error(message, cause, self._instance_id, request)

        finally:
            self._project.analyses.rerun()

    def _open_callback(self, task, progress):
        response = jcoms.ComsMessage()
        response.open.status = jcoms.Status.Value('IN_PROGRESS')
        response.open.progress = progress
        response.open.progress_task = task

        self._coms.send(response, self._instance_id)

    def _main_settings_changed(self, event):
        if 'theme' in event.data or 'palette' in event.data or 'decSymbol' in event.data:
            for analysis in self._project.analyses:
                main_settings = self._settings.group('main')
                analysis.options.set_value('theme', main_settings.get('theme', 'default'))
                analysis.options.set_value('palette', main_settings.get('palette', 'default'))
                analysis.options.set_value('decSymbol', main_settings.get('decSymbol', '.'))
                if analysis.enabled:
                    analysis.run()

    async def _on_analysis(self, request):

        if request.restartEngines:
            await self.session.restart_engines()
            self._project.analyses.rerun()
            return

        elif request.perform == jcoms.AnalysisRequest.Perform.Value('DELETE') and request.analysisId == 0:  # request to delete all analyses
            # delete all analyses
            self._project.analyses.remove_all()

            header = self._project.analyses.create_annotation(0)
            header.results.index = 1
            header.results.title = _('Results')

            # find all output columns
            dataset = self._project.get_dataset()
            columns_to_delete = [ ]

            for column in dataset:
                if column.column_type == ColumnType.OUTPUT:
                    columns_to_delete.append(column.id)

            # send responses
            self._coms.send(request, self._instance_id, request)
            self._coms.send(header.results, self._instance_id)

            self._delete_columns(dataset, columns_to_delete)

            return

        analysis = None
        if request.analysisId != 0:
            analysis = self._project.analyses.get(request.analysisId)

        if analysis is not None:  # analysis already exists
            self._project.is_edited = True
            if request.perform == jcoms.AnalysisRequest.Perform.Value('DELETE'):
                analysis_to_delete = self._project.analyses[request.analysisId]
                if analysis_to_delete.name != 'empty':
                    # delete analyses
                    for child in analysis_to_delete.dependents:
                        del self._project.analyses[child.id]
                    del self._project.analyses[request.analysisId]

                    # delete all output columns
                    dataset = analysis_to_delete.dataset
                    columns_to_delete = [ ]

                    for column in dataset:
                        if column.output_analysis_id == request.analysisId:
                            columns_to_delete.append(column.id)

                    # send responses
                    self._coms.send(request, self._instance_id, request, True)

                    self._delete_columns(dataset, columns_to_delete)

                else:
                    analysis_to_delete.reset_options(request.revision)
                    self._coms.send(analysis_to_delete.results, self._instance_id, request, True)
            else:
                analysis.set_options(request.options, request.changed, request.revision, request.enabled)
                self._coms.send(None, self._instance_id, request, True)
        else:  # create analysis
            try:
                duplicating = request.perform == jcoms.AnalysisRequest.Perform.Value('DUPLICATE')

                if duplicating:
                    names = list(request.options.names)
                    index = names.index('duplicate')
                    dupliceeId = request.options.options[index].i
                    duplicee = self._project.analyses.get(dupliceeId)

                if self._project.analyses.has_header_annotation() is False:
                    header = self._project.analyses.create_annotation(0)
                    header.results.index = 1
                    header.results.title = _('Results')
                    if request.name == 'empty':
                        self._coms.send(header.results, self._instance_id, request, complete=True)
                    else:
                        self._coms.send(header.results, self._instance_id, complete=True)

                    # increment the index of the request, so it's placed after the header
                    request.index += 1

                if request.name != 'empty':

                    if request.analysisId % 2 != 0:
                        raise Exception('Analyses created by the client must have an even id')

                    analysis = self._project.analyses.create(
                        request.analysisId,
                        request.name,
                        request.ns,
                        request.options,
                        None if request.index == 0 else request.index - 1)

                    self._project.is_edited = True

                    if duplicating:
                        analysis.copy_from(duplicee)
                        analysis.results.index = request.index
                        self._coms.send(analysis.results, self._instance_id, request, True)
                    else:
                        response = jcoms.AnalysisResponse()
                        response.name = request.name
                        response.ns = request.ns
                        response.instanceId = self.id
                        response.analysisId = analysis.id
                        response.options.ParseFromString(analysis.options.as_bytes())
                        response.index = request.index
                        response.status = jcoms.AnalysisStatus.Value('ANALYSIS_NONE')
                        self._coms.send(response, self._instance_id, request, True)
                        analysis.run()
                    child_index = request.index + 1
                    for child in analysis.dependents:
                        child.results.index = child_index
                        child_index += 1
                        self._coms.send(child.results, self._instance_id, complete=True)

            except OSError as e:

                log.error('Could not create analysis: ' + str(e))

                response = jcoms.AnalysisResponse()
                response.instanceId = self.id
                response.analysisId = analysis.id
                response.status = jcoms.AnalysisStatus.Value('ANALYSIS_ERROR')
                response.error.message = 'Could not create analysis: ' + str(e)

                self._coms.send(response, self._instance_id, request, True)

    def _delete_columns(self, dataset, column_ids):
        """Delete columns from a data set, and broadcast the removal."""
        if not column_ids:
            return
        dataset.delete_columns_by_id(column_ids)
        broadcast = jcoms.DataSetRR()
        for id in column_ids:
            column_pb = broadcast.schema.columns.add()
            column_pb.id = id
            column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')
        self._controllers[dataset.id].populate_schema_info(None, broadcast)
        self._coms.send(broadcast, self._instance_id)

    def _on_info(self, request):

        response = jcoms.InfoResponse()

        has_dataset = self._project.has_datasets
        response.hasDataSet = has_dataset

        response.resultsLanguage = self._project.results_language

        if has_dataset:
            controller = self._controller()

            response.title = self._project.title
            response.path = self._virtualise_path(self._project.path)
            response.saveFormat = self._project.save_format
            response.edited = self._project.is_edited
            response.blank = self._project.is_blank
            response.changesCount = controller.mod_tracker.count
            response.changesPosition = controller.mod_tracker.position

            controller.populate_schema(response.schema)

        for analysis in self._project.analyses:
            if analysis.has_results:
                analysis_pb = response.analyses.add()
                analysis_pb.CopyFrom(analysis.results)
                # ensure the following are set correctly
                # analysis.results is read from a file, and can't be trusted
                analysis_pb.enabled = analysis.enabled
                analysis_pb.arbitraryCode = analysis.arbitrary_code

        self._coms.send(response, self._instance_id, request)

    async def _on_module(self, request):

        modules = self._session.modules

        try:
            if request.command == jcoms.ModuleRR.ModuleCommand.Value('INSTALL'):
                if self._perms.library.addRemove is False:
                    raise PermissionError()

                try:
                    stream = modules.install(request.path)
                    async for progress in stream:
                        self._coms.send(None, self._instance_id, request, complete=False, progress=progress)

                    self._coms.send(None, self._instance_id, request)
                    self._session.notify_global_changes()
                except Exception as e:
                    log.exception(e)
                    if self._coms is not None:
                        self._coms.send_error(_('Unable to install module'), str(e), self._instance_id, request)

            elif request.command == jcoms.ModuleRR.ModuleCommand.Value('UNINSTALL'):
                if self._perms.library.addRemove is False:
                    raise PermissionError()
                try:
                    await modules.uninstall(request.name)
                    self._coms.send(None, self._instance_id, request)
                    self._session.notify_global_changes()
                except Exception as e:
                    log.exception(e)
                    if self._coms is not None:
                        self._coms.send_error(str(e), None, self._instance_id, request)
            elif request.command == jcoms.ModuleRR.ModuleCommand.Value('SHOW'):
                if self._perms.library.showHide is False:
                    raise PermissionError()
                self._set_module_visibility(request.name, True)
                if self._coms is not None:
                    self._coms.send(None, self._instance_id, request)
                self._session.notify_global_changes()
            elif request.command == jcoms.ModuleRR.ModuleCommand.Value('HIDE'):
                if self._perms.library.showHide is False:
                    raise PermissionError()
                self._set_module_visibility(request.name, False)
                if self._coms is not None:
                    self._coms.send(None, self._instance_id, request)
                self._session.notify_global_changes()

        except PermissionError as e:
            if self._coms is not None:
                self._coms.send_error(_('Unable to perform request'), str(e), self._instance_id, request)

    def _set_module_visibility(self, name, value):
        modules = self._session.modules
        if modules.set_visibility(name, value):
            module_settings = self._settings.group('modules')
            hidden_mods = module_settings.get('hidden', [ ])
            if value:
                hidden_mods = [ mod for mod in hidden_mods if mod != name ]
            else:
                hidden_mods.append(name)
            module_settings.set('hidden', hidden_mods)
            module_settings.write()

    async def _on_store(self, request):
        if self._perms.library.browseable is False:
            self._coms.send_error(_('Unable to access library'), _('The library is disabled'), self._instance_id, request)
        else:
            modules = self._session.modules
            stream = modules.read_library()

            try:
                async for result in stream:
                    self._coms.send(None, self._instance_id, request, complete=False, progress=result)

                result = stream.result()
                response = jcoms.StoreResponse()
                if result.message is not None:
                    response.message = result.message
                for module in result.modules:
                    module_pb = response.modules.add()
                    self._module_to_pb(module, module_pb)
                self._coms.send(response, self._instance_id, request)
            except Exception as e:
                self._coms.send_error(_('Unable to access library'), str(e), self._instance_id, request)

    def _add_to_recents(self, path, title=None):

        bs_settings = self._settings.group('backstage')
        recents  = bs_settings.get('recents', [ ])

        for recent in recents:
            if path == recent['path']:
                recents.remove(recent)
                break

        if is_url(path):
            location = parse.urlsplit(path).netloc
            if not title:
                title = 'Remote data set'
        else:
            title = os.path.basename(path)
            location = os.path.dirname(path)
            location = self._virtualise_path(location)

        recents.insert(0, { 'name': title, 'path': path, 'location': location })
        recents = recents[0:5]

        bs_settings.set('recents', recents)
        bs_settings.write()

        self._session.notify_global_changes()

    def _on_settings(self, request=None):

        main_settings = self._settings.group('main')

        if request and request.settings:

            settings_pb = request.settings

            for setting_pb in settings_pb:
                name = setting_pb.name
                if setting_pb.valueType == jcoms.ValueType.Value('STRING'):
                    value = setting_pb.s
                elif setting_pb.valueType == jcoms.ValueType.Value('INT'):
                    value = setting_pb.i
                elif setting_pb.valueType == jcoms.ValueType.Value('DOUBLE'):
                    value = setting_pb.d
                elif setting_pb.valueType == jcoms.ValueType.Value('BOOL'):
                    value = setting_pb.b
                else:
                    continue

                if name == 'updateStatus':
                    self._session.request_update(value)
                else:
                    main_settings.set(name, value)

            main_settings.write()

            self._session.notify_global_changes()

        response = jcoms.SettingsResponse()

        for name in main_settings:
            value = main_settings.get(name)
            if isinstance(value, str):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.s = value
            elif isinstance(value, bool):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.b = value
            elif isinstance(value, int):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.i = value
            elif isinstance(value, float):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.d = value

        bs_settings = self._settings.group('backstage')
        recents = bs_settings.get('recents', [ ])

        for recent in recents:
            recent_pb = response.recents.add()
            recent_pb.name = recent['name']
            recent_pb.path = recent['path']
            recent_pb.location = recent['location']

        module_settings = self._settings.group('modules')
        hidden_mods = module_settings.get('hidden', [ ])
        modules = self._session.modules
        missing_mods = [ ]
        for hidden_mod in hidden_mods:
            if modules.set_visibility(hidden_mod, False) is False:
                missing_mods.append(hidden_mod)

        if len(missing_mods) > 0:
            for missing_mod in missing_mods:
                while missing_mod in hidden_mods:
                    hidden_mods.remove(missing_mod)
            module_settings.set('hidden', hidden_mods)

        for module in modules:
            module_pb = response.modules.add()
            self._module_to_pb(module, module_pb)

        mode = conf.get('mode', 'normal')
        conf_pb = response.config.add()
        conf_pb.name = 'mode'
        conf_pb.s = mode

        conf_pb = response.config.add()
        conf_pb.name = 'permissions_library_browseable'
        conf_pb.b = self._perms.library.browseable

        conf_pb = response.config.add()
        conf_pb.name = 'permissions_library_add_remove'
        conf_pb.b = self._perms.library.addRemove

        conf_pb = response.config.add()
        conf_pb.name = 'permissions_library_show_hide'
        conf_pb.b = self._perms.library.showHide

        conf_pb = response.config.add()
        conf_pb.name = 'permissions_library_side_load'
        conf_pb.b = self._perms.library.sideLoad

        self._coms.send(response, self._instance_id, request)

    def _module_to_pb(self, module, module_pb):

        try:
            version = module.version
            version = version[:4]
            version.extend((4 - len(version)) * [0])
            version = int.from_bytes(version, byteorder='big')
        except Exception:
            version = 0

        try:
            min_version = module.min_app_version
            min_version = min_version[:4]
            min_version.extend((4 - len(min_version)) * [0])
            min_version = int.from_bytes(min_version, byteorder='big')
        except Exception:
            # makes it uninstallable
            min_version = int.from_bytes([255, 255, 255, 255], byteorder='big')

        module_pb.name = module.name
        module_pb.title = module.title
        module_pb.version = version
        module_pb.buildTime = module.build_time
        module_pb.description = module.description
        module_pb.category = module.category
        module_pb.authors.extend(module.authors)
        module_pb.path = module.path
        module_pb.isSystem = module.is_sys
        module_pb.new = module.new
        module_pb.minAppVersion = min_version
        module_pb.visible = module.visible
        module_pb.incompatible = module.incompatible

        for analysis in module.analyses:
            if not analysis.in_menu:
                continue
            analysis_pb = module_pb.analyses.add()
            analysis_pb.name = analysis.name
            analysis_pb.ns = analysis.ns
            analysis_pb.title = analysis.title
            analysis_pb.menuGroup = analysis.menuGroup
            analysis_pb.menuSubgroup = analysis.menuSubgroup
            analysis_pb.menuTitle = analysis.menuTitle
            analysis_pb.menuSubtitle = analysis.menuSubtitle
            analysis_pb.category = analysis.category


    def terminate(self, message, cause=''):
        if self._coms is not None:
            self._coms.send_error(message=message, cause=cause)

    class LogHandler(logging.Handler):
        def __init__(self, instance):
            self._instance = instance
            logging.Handler.__init__(self)

        def emit(self, record):
            if self._instance._coms is None:
                return

            filename = os.path.basename(record.pathname)
            message = '{} ({}): {}'.format(filename, record.lineno, record.getMessage())
            broadcast = jcoms.LogRR(
                content=message)
            self._instance._coms.send(broadcast, self._instance._instance_id)
