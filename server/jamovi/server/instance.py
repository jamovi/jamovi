#
# Copyright (C) 2016 Jonathon Love
#

import os
import os.path
import platform

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType
from jamovi.core import Dirs
from jamovi.core import MemoryMap
from jamovi.core import DataSet

from .settings import Settings

from . import jamovi_pb2 as jcoms

from .utils import conf
from .utils import FileEntry
from .utils import CSVParser
from .utils import HTMLParser
from .enginemanager import EngineManager
from .modules import Modules
from .instancemodel import InstanceModel
from . import formatio

import uuid
import posixpath
import math
import yaml
import logging
import time
import asyncio

from .utils import fs

log = logging.getLogger('jamovi')


# until we deploy the windows updater and are happy with it,
# we'll default autoUpdate to off -- macOS works well though.
is_windows = platform.uname().system == 'Windows'
def4ult = False if is_windows else True
Settings.retrieve('main').specify_default('autoUpdate', def4ult)


class Instance:

    instances = { }
    _garbage_collector = None
    _update_status = 'na'

    def _update_status_req(x):
        # this gets assigned to
        pass

    @staticmethod
    def set_update_status(status):
        Instance._update_status = status
        for instanceId, instance in Instance.instances.items():
            if instance.is_active:
                instance._on_settings()

        if status == 'available':
            settings = Settings.retrieve('main')
            settings.sync()
            if settings.get('autoUpdate', False):
                Instance._update_status_req('downloading')

    @staticmethod
    def set_update_request_handler(request_fun):
        Instance._update_status_req = request_fun

    @staticmethod
    def get(instance_id):
        return Instance.instances.get(instance_id)

    def __init__(self, session_path, instance_id=None):
        if Instance._garbage_collector is None:
            ioloop = asyncio.get_event_loop()
            gc = GarbageCollection()
            Instance._garbage_collector = ioloop.create_task(gc)

        self._session_path = session_path
        if instance_id is None:
            instance_id = str(uuid.uuid4())
        self._instance_id = instance_id

        self._mm = None
        self._data = InstanceModel()

        self._coms = None
        self._em = EngineManager(self._instance_id, self._data.analyses, session_path)
        self._inactive_since = None

        self._data.analyses.add_results_changed_listener(self._on_results)
        self._em.add_engine_listener(self._on_engine_event)

        settings = Settings.retrieve()
        settings.sync()

        self._data.instance_path = os.path.join(self._session_path, self._instance_id)
        os.makedirs(self._data.instance_path, exist_ok=True)
        self._buffer_path = os.path.join(self._data.instance_path, 'buffer')

        self._em.start()

        Instance.instances[self._instance_id] = self

        Modules.instance().add_listener(self._module_event)

        handler = Instance.LogHandler(self)
        handler.setLevel('DEBUG')
        self._log = logging.getLogger(instance_id)
        self._log.propagate = False
        self._log.setLevel('DEBUG')
        self._log.addHandler(handler)
        self._data.set_log(self._log)

    def _normalise_path(path):
        nor_path = path
        if path.startswith('{{Documents}}'):
            nor_path = path.replace('{{Documents}}', Dirs.documents_dir())
        elif path.startswith('{{Downloads}}'):
            nor_path = path.replace('{{Downloads}}', Dirs.downloads_dir())
        elif path.startswith('{{Desktop}}'):
            nor_path = path.replace('{{Desktop}}', Dirs.desktop_dir())
        elif path.startswith('{{Home}}'):
            nor_path = path.replace('{{Home}}', Dirs.home_dir())
        elif path.startswith('{{Examples}}'):
            nor_path = path.replace('{{Examples}}', conf.get('examples_path'))
        return nor_path

    def _virtualise_path(path):

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
        if event['type'] == 'moduleInstalled':
            module_name = event['data']['name']
            self._notify_module_installed(module_name)

    @property
    def id(self):
        return self._instance_id

    def set_coms(self, coms):
        if self._coms is not None:
            self._coms.remove_close_listener(self._close)
        self._coms = coms
        self._coms.add_close_listener(self._close)
        self._inactive_since = None

    def close(self):
        Modules.instance().remove_listener(self._module_event)
        if self._mm is not None:
            self._mm.close()
        self._em.stop()

    def _close(self):
        self._coms.remove_close_listener(self._close)
        self._coms = None
        self._inactive_since = time.time()

    @property
    def is_active(self):
        return self._coms is not None

    @property
    def inactive_for(self):
        if self._inactive_since is None:
            return 0
        else:
            return time.time() - self._inactive_since

    @property
    def analyses(self):
        return self._data.analyses

    def get_path_to_resource(self, resourceId):
        return os.path.join(self._data.instance_path, resourceId)

    def on_request(self, request):
        if type(request) == jcoms.DataSetRR:
            self._on_dataset(request)
        elif type(request) == jcoms.OpenRequest:
            self._on_open(request)
        elif type(request) == jcoms.SaveRequest:
            self._on_save(request)
        elif type(request) == jcoms.InfoRequest:
            self._on_info(request)
        elif type(request) == jcoms.SettingsRequest:
            self._on_settings(request)
        elif type(request) == jcoms.AnalysisRequest:
            self._on_analysis(request)
        elif type(request) == jcoms.FSRequest:
            self._on_fs_request(request)
        elif type(request) == jcoms.ModuleRR:
            self._on_module(request)
        elif type(request) == jcoms.StoreRequest:
            self._on_store(request)
        else:
            log.info('unrecognised request')
            log.info(request.payloadType)

    def _on_results(self, analysis):
        if self._coms is not None:
            self._coms.send(analysis.results, self._instance_id)

    def _on_fs_request(self, request):
        path = request.path

        if path != '':
            abs_path = Instance._normalise_path(path)
            path = Instance._virtualise_path(path)
        else:
            try:
                path = '{{Documents}}'
                abs_path = Dirs.documents_dir()
                if os.path.exists(abs_path):
                    path = '{{Documents}}'
                else:
                    path = '{{Root}}'
            except Exception:
                path = '{{Root}}'

        response = jcoms.FSResponse()
        response.path = path
        response.osPath = abs_path

        if path.startswith('{{Root}}'):

            try:
                if os.path.exists(Dirs.documents_dir()):
                    entry = response.contents.add()
                    entry.name = 'Documents'
                    entry.path = '{{Documents}}'
                    entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
            except Exception:
                pass

            try:
                if os.path.exists(Dirs.downloads_dir()):
                    entry = response.contents.add()
                    entry.name = 'Downloads'
                    entry.path = '{{Downloads}}'
                    entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
            except Exception:
                pass

            try:
                if os.path.exists(Dirs.desktop_dir()):
                    entry = response.contents.add()
                    entry.name = 'Desktop'
                    entry.path = '{{Desktop}}'
                    entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
            except Exception:
                pass

            try:
                if os.path.exists(Dirs.home_dir()):
                    entry = response.contents.add()
                    entry.name = 'Home'
                    entry.path = '{{Home}}'
                    entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
            except Exception:
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

        else:
            try:
                entries = [ ]

                for direntry in os.scandir(abs_path + '/'):  # add a / in case we get C:

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
                        show = formatio.is_supported(direntry.name)

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

            except OSError as e:
                base    = os.path.basename(abs_path)
                message = 'Unable to open {}'.format(base)
                cause = e.strerror
                self._coms.send_error(message, cause, self._instance_id, request)

    def _on_save(self, request):
        path = request.filename
        path = Instance._normalise_path(path)

        try:
            file_exists = os.path.isfile(path)
            if file_exists is False or request.overwrite is True:
                if path.endswith('.omv'):
                    self._on_save_everything(request)
                elif request.incContent:
                    self._on_save_content(request)
                elif request.part != '':
                    self._on_save_part(request)
                else:
                    self._on_save_everything(request)
            else:
                response = jcoms.SaveProgress()
                response.fileExists = True
                response.success = False
                self._coms.send(response, self._instance_id, request)

        except OSError as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to save {}'.format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)

        except Exception as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to save {}'.format(base)
            cause = str(e)
            self._coms.send_error(message, cause, self._instance_id, request)

    def _on_save_content(self, request):
        path = request.filename
        path = Instance._normalise_path(path)

        with open(path, 'wb') as file:
            file.write(request.content)

        response = jcoms.SaveProgress()
        response.success = True
        self._coms.send(response, self._instance_id, request)

    def _on_save_everything(self, request):
        path = request.filename
        path = Instance._normalise_path(path)
        is_export = request.export
        content = request.content

        formatio.write(self._data, path, content)

        if not is_export:
            self._data.title = os.path.splitext(os.path.basename(path))[0]
            self._data.path = path
            self._data.is_edited = False

        response = jcoms.SaveProgress()
        response.success = True
        response.path = Instance._virtualise_path(path)
        self._coms.send(response, self._instance_id, request)

        if not is_export:
            self._add_to_recents(path)

    def _on_save_part(self, request):
        path = request.filename
        path = Instance._normalise_path(path)
        part = request.part

        segments = part.split('/')
        analysisId = int(segments[0])
        address = '/'.join(segments[1:])

        analysis = self.analyses.get(analysisId)

        if analysis is not None:
            result = analysis.save(path, address)
            result.add_done_callback(lambda result: self._on_part_saved(request, result))
        else:
            self._coms.send_error('Error', 'Unable to access analysis', self._instance_id, request)

    def _on_part_saved(self, request, result):
        try:
            result.result()
            response = jcoms.SaveProgress()
            response.success = True
            self._coms.send(response, self._instance_id, request)
        except Exception as e:
            self._coms.send_error('Unable to save', str(e), self._instance_id, request)

    def _on_open(self, request):
        path = request.filename

        try:
            norm_path = Instance._normalise_path(path)
            virt_path = Instance._virtualise_path(path)

            self._mm = MemoryMap.create(self._buffer_path, 4 * 1024 * 1024)
            dataset = DataSet.create(self._mm)

            self._data.dataset = dataset

            is_example = path.startswith('{{Examples}}')

            def prog_cb(p):
                self._coms.send(None,
                                self._instance_id,
                                request,
                                complete=False,
                                progress=(1000 * p, 1000))

            formatio.read(self._data, norm_path, prog_cb, is_example)

            response = jcoms.OpenProgress()
            response.path = virt_path

            self._coms.send(response, self._instance_id, request)

            if path != '' and not is_example:
                self._add_to_recents(path)

        except OSError as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to open {}'.format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)

        except Exception as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to open {}'.format(base)
            cause = str(e)
            self._coms.send_error(message, cause, self._instance_id, request)

    def _open_callback(self, task, progress):
        response = jcoms.ComsMessage()
        response.open.status = jcoms.Status.Value('IN_PROGRESS')
        response.open.progress = progress
        response.open.progress_task = task

        self._coms.send(response, self._instance_id)

    def rerun(self):
        self._em.restart_engines()

    def _on_analysis(self, request):

        if request.restartEngines:
            self.rerun()
            return

        if request.analysisId == 0:
            log.error('Instance._on_analysis(): Analysis id of zero is not allowed')
            self._coms.discard(request)
            return

        analysis = self._data.analyses.get(request.analysisId)

        if analysis is not None:  # analysis already exists
            self._data.is_edited = True
            if request.perform == jcoms.AnalysisRequest.Perform.Value('DELETE'):
                del self._data.analyses[request.analysisId]
            else:
                analysis.set_options(request.options, request.changed, request.enabled)

        else:  # create analysis
            try:
                analysis = self._data.analyses.create(
                    request.analysisId,
                    request.name,
                    request.ns,
                    request.options,
                    request.enabled)
                self._data.is_edited = True

                response = jcoms.AnalysisResponse()
                response.analysisId = request.analysisId
                response.options.ParseFromString(analysis.options.as_bytes())
                response.status = jcoms.AnalysisStatus.Value('ANALYSIS_NONE')

                self._coms.send(response, self._instance_id, request, False)

            except OSError as e:

                log.error('Could not create analysis: ' + str(e))

                response = jcoms.AnalysisResponse()
                response.analysisId = request.analysisId
                response.status = jcoms.AnalysisStatus.Value('ANALYSIS_ERROR')
                response.error.message = 'Could not create analysis: ' + str(e)

                self._coms.send(response, self._instance_id, request, True)

    def _on_info(self, request):

        response = jcoms.InfoResponse()

        has_dataset = self._data.has_dataset
        response.hasDataSet = has_dataset

        if has_dataset:
            response.title = self._data.title
            response.path = Instance._virtualise_path(self._data.path)
            response.edited = self._data.is_edited
            response.blank = self._data.is_blank
            response.importPath = Instance._virtualise_path(self._data.import_path)

            response.schema.rowCount = self._data.row_count
            response.schema.vRowCount = self._data.virtual_row_count
            response.schema.columnCount = self._data.column_count
            response.schema.vColumnCount = self._data.visible_column_count
            response.schema.tColumnCount = self._data.total_column_count

            for column in self._data:
                column_schema = response.schema.columns.add()
                self._populate_column_schema(column, column_schema)

            for transform in self._data.transforms:
                transform_schema = response.schema.transforms.add()
                self._populate_transform_schema(transform, transform_schema)

        for analysis in self._data.analyses:
            if analysis.has_results:
                analysis_pb = response.analyses.add()
                analysis_pb.CopyFrom(analysis.results)

        self._coms.send(response, self._instance_id, request)

    def _on_dataset(self, request):

        if self._data is None:
            return

        try:

            response = jcoms.DataSetRR()

            response.op = request.op
            response.rowStart    = request.rowStart
            response.columnStart = request.columnStart
            response.rowEnd      = request.rowEnd
            response.columnEnd   = request.columnEnd

            if request.op == jcoms.GetSet.Value('SET'):
                self._on_dataset_set(request, response)
            elif request.op == jcoms.GetSet.Value('GET'):
                self._on_dataset_get(request, response)
            elif request.op == jcoms.GetSet.Value('INS_ROWS'):
                self._on_dataset_ins_rows(request, response)
            elif request.op == jcoms.GetSet.Value('INS_COLS'):
                self._on_dataset_ins_cols(request, response)
            elif request.op == jcoms.GetSet.Value('DEL_ROWS'):
                self._on_dataset_del_rows(request, response)
            elif request.op == jcoms.GetSet.Value('DEL_COLS'):
                self._on_dataset_del_cols(request, response)
            else:
                raise ValueError()

            self._coms.send(response, self._instance_id, request)

        except TypeError as e:
            self._coms.send_error('Could not assign data', str(e), self._instance_id, request)
        except Exception as e:
            log.exception(e)
            self._coms.send_error('Could not assign data', str(e), self._instance_id, request)

    def _on_module(self, request):

        modules = Modules.instance()

        if request.command == jcoms.ModuleRR.ModuleCommand.Value('INSTALL'):
            modules.install(
                request.path,
                lambda t, result: self._on_module_callback(t, result, request))
        elif request.command == jcoms.ModuleRR.ModuleCommand.Value('UNINSTALL'):
            try:
                modules.uninstall(request.name)
                self._coms.send(None, self._instance_id, request)
                self._notify_modules_changed()
            except Exception as e:
                log.exception(e)
                self._coms.send_error(str(e), None, self._instance_id, request)

    def _on_module_callback(self, t, result, request):
        if t == 'progress':
            self._coms.send(None, self._instance_id, request, complete=False, progress=result)
        elif t == 'error':
            self._coms.send_error('Unable to install module', str(result), self._instance_id, request)
        elif t == 'success':
            self._coms.send(None, self._instance_id, request)
            self._notify_modules_changed()
        else:
            log.error("Instance._on_module_callback(): shouldn't get here")

    def _on_module_install_error(self, request, e):
        log.error(str(e))
        self._coms.send_error(str(e), None, self._instance_id, request)

    def _on_module_install_progress(self, request, progress):
        print(progress)

    def _on_store(self, request):
        modules = Modules.instance()
        modules.read_store(lambda t, res: self._on_store_callback(request, t, res))

    def _on_store_callback(self, request, t, result):
        if t == 'progress':
            self._coms.send(None, self._instance_id, request, complete=False, progress=result)
        elif t == 'error':
            self._coms.send_error('Unable to access library', str(result), self._instance_id, request)
        elif t == 'success':
            response = jcoms.StoreResponse()
            for module in result:
                module_pb = response.modules.add()
                self._module_to_pb(module, module_pb)
            self._coms.send(response, self._instance_id, request)
        else:
            log.error('_on_store_callback(): shouldnt get here')

    def _notify_modules_changed(self):
        for instanceId, instance in Instance.instances.items():
            if instance.is_active:
                instance._on_settings()

    def _notify_module_installed(self, name):

        broadcast = jcoms.ModuleRR()
        broadcast.command = jcoms.ModuleRR.ModuleCommand.Value('INSTALL')
        broadcast.name = name

        if self._coms is not None:
            self._coms.send(broadcast, self._instance_id)

    def _on_dataset_set(self, request, response):
        if request.incData or request.incCBData:
            self._apply_cells(request, response)
        if request.incSchema:
            self._apply_schema(request, response)

    def _on_dataset_get(self, request, response):
        if request.incSchema:
            self._populate_schema(request, response)
        if request.incData:
            self._populate_cells(request, response)

    def _on_dataset_ins_rows(self, request, response):
        self._data.insert_rows(request.rowStart, request.rowEnd)
        self._populate_schema(request, response)

    def _on_dataset_ins_cols(self, request, response):
        filter_inserted = False
        to_calc = set()

        for i in range(request.columnStart, request.columnEnd + 1):
            self._data.insert_column(i)
            column = self._data[i]

            if request.incSchema:
                column_pb = request.schema.columns[i - request.columnStart]

                name = None
                if column_pb.name != '':
                    name = column_pb.name
                    orig_name = name
                    used_names = list(map(lambda x: x.name, self._data))
                    i = 2
                    while name in used_names:
                        name = '{} ({})'.format(orig_name, i)
                        i += 1

                    column.name = name

                column.column_type = ColumnType(column_pb.columnType)

                column.change(
                    data_type=DataType(column_pb.dataType),
                    measure_type=MeasureType(column_pb.measureType))

                column.formula = column_pb.formula
                column.auto_measure = column_pb.autoMeasure
                column.hidden = column_pb.hidden
                column.active = column_pb.active
                column.filter_no = column_pb.filterNo
                column.trim_levels = column_pb.trimLevels
                column.transform = column_pb.transform

                if column.column_type is ColumnType.FILTER:
                    filter_inserted = True
                    to_calc.add(column)

                if column.column_type is ColumnType.COMPUTED:
                    to_calc.add(column)

        if filter_inserted:
            self._data.update_filter_names()

        for column in to_calc:
            column.parse_formula()
            column.needs_recalc = True

        for column in to_calc:
            column.recalc()

        if filter_inserted:
            # we could do this, but a newly inserted filter is all 'true'
            # self._data.update_filter_status()
            # so i don't think we need to
            pass

        self._populate_schema_info(request, response)

        # has to be after the filter names are renamed
        for i in range(request.columnStart, request.columnEnd + 1):
            column = self._data[i]
            column_pb = response.schema.columns.add()
            self._populate_column_schema(column, column_pb)

    def _on_dataset_del_rows(self, request, response):
        self._data.delete_rows(request.rowStart, request.rowEnd)
        self._populate_schema(request, response)

    def _on_dataset_del_cols(self, request, response):

        to_delete = [None] * (request.columnEnd - request.columnStart + 1)
        filter_deleted = False

        for i in range(len(to_delete)):
            column = self._data[i + request.columnStart]
            column.prep_for_deletion()
            to_delete[i] = column
            if column.column_type is ColumnType.FILTER:
                filter_deleted = True

        to_reparse = set()
        for column in to_delete:
            dependents = column.dependents
            to_reparse.update(dependents)
        to_reparse -= set(to_delete)

        self._data.delete_columns(request.columnStart, request.columnEnd)

        for column in to_reparse:
            column.parse_formula()

        if filter_deleted:
            to_recalc = self._data  # all
        else:
            to_recalc = to_reparse

        for column in to_recalc:
            column.needs_recalc = True

        for column in to_recalc:
            column.recalc()

        to_reparse = sorted(to_reparse, key=lambda x: x.index)

        if filter_deleted:
            self._data.update_filter_status()
            self._populate_schema(request, response)
        else:
            self._populate_schema_info(request, response)
            for column in to_reparse:
                column_schema = response.schema.columns.add()
                self._populate_column_schema(column, column_schema)

    def _apply_schema(self, request, response):
        trans_changed = set()
        for transform_pb in request.schema.transforms:
            if transform_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('REMOVE'):
                self._data.remove_transform(transform_pb.id)
                for column_pb in request.schema.columns:  # check for collisions with an existing request
                    if column_pb.transform == transform_pb.id:
                        column_pb.transform = 0

                for column in self._data:  # create requests to modify columns that rely on transform
                    if column.transform == transform_pb.id:
                        new_request = True
                        for column_pb in request.schema.columns:
                            if column_pb.id == column.id:
                                new_request = False
                                break
                        if new_request:
                            column_pb = request.schema.columns.add()
                            self._populate_column_schema(column, column_pb)
                            column_pb.transform = 0

            else:
                transform = None
                if transform_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('CREATE'):
                    transform = self._data.append_transform(transform_pb.name, transform_pb.id)
                elif transform_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('UPDATE'):
                    transform = self._data.get_transform_by_id(transform_pb.id)
                    self._data.set_transform_name(transform, transform_pb.name)

                transform.formula = list(transform_pb.formula)
                transform.description = transform_pb.description
                trans_changed.add(transform)

        n_cols_before = self._data.total_column_count
        filter_changed = False
        cols_changed = set()

        if len(request.schema.columns) > 0:
            min_index = self._data.total_column_count
            for column_schema in request.schema.columns:
                column = self._data.get_column_by_id(column_schema.id)
                if column.index < min_index:
                    min_index = column.index

            recalc = set()
            reparse = set()

            # 'realise' any virtual columns to the left of the edit
            for i in range(self._data.column_count, min_index):
                column = self._data[i]
                column.realise()
                cols_changed.add(column)

            for column_pb in request.schema.columns:
                column = self._data.get_column_by_id(column_pb.id)
                old_name = column.name
                old_type = column.column_type
                old_d_type = column.data_type
                old_m_type = column.measure_type
                old_formula = column.formula
                old_active = column.active
                old_type = column.column_type
                old_filter_no = column.filter_no
                old_levels = column.levels
                old_trim = column.trim_levels
                old_transform = column.transform

                levels = None
                if column_pb.hasLevels:
                    levels = [ ]
                    for level in column_pb.levels:
                        levels.append((
                            level.value,
                            level.label,
                            level.importValue))

                if column.column_type is ColumnType.NONE:
                    column.column_type = ColumnType(column_pb.columnType)

                if column.column_type is ColumnType.DATA:
                    column.change(
                        data_type=DataType(column_pb.dataType),
                        measure_type=MeasureType(column_pb.measureType),
                        levels=levels)

                if column_pb.name != '':
                    column.name = column_pb.name

                column.column_type = ColumnType(column_pb.columnType)

                column.formula = column_pb.formula
                column.auto_measure = column_pb.autoMeasure
                column.hidden = column_pb.hidden
                column.active = column_pb.active
                column.filter_no = column_pb.filterNo
                column.trim_levels = column_pb.trimLevels
                column.description = column_pb.description
                column.transform = column_pb.transform

                cols_changed.add(column)

                if (column.name == old_name and
                        column.column_type == old_type and
                        column.data_type == old_d_type and
                        column.measure_type == old_m_type and
                        column.formula == old_formula and
                        column.filter_no == old_filter_no and
                        column.levels == old_levels and
                        column.active == old_active and
                        column.trim_levels == old_trim and
                        column.transform == old_transform):
                    # if these things haven't changed, no need
                    # to trigger recalcs
                    continue

                recalc.add(column)

                if column.column_type is ColumnType.FILTER:
                    if column.formula != old_formula:
                        filter_changed = True
                    elif column.active != old_active:
                        filter_changed = True

                dependents = column.dependents

                for dep in dependents:
                    # we have to reparse dependent filters in case the formula
                    # has changed to include a 'V' or column function
                    if dep.is_filter:
                        filter_changed = True
                        reparse.add(dep)

                cols_changed.update(dependents)
                recalc.update(dependents)

                if old_name != column.name:     # if a name has changed, then
                    reparse.update(dependents)  # dep columns need to be reparsed
                elif old_d_type != column.data_type:
                    reparse.update(dependents)
                elif old_m_type != column.measure_type:
                    reparse.update(dependents)

            if filter_changed:
                # reparse filters, recalc all
                for column in self._data:
                    if column.is_filter:
                        reparse.add(column)
                    else:
                        break
                recalc = self._data

            reparse = sorted(reparse, key=lambda x: x.index)
            for column in reparse:
                column.parse_formula()

            for column in recalc:
                column.needs_recalc = True
            for column in recalc:
                column.recalc()

        self._data.is_edited = True

        if filter_changed:
            # easiest way to refresh the whole viewport is just to send back
            # the whole data set schema (i.e. all the columns)
            self._data.update_filter_status()
            self._populate_schema(request, response)
        else:
            self._populate_schema_info(request, response)

            for i in range(n_cols_before, self._data.total_column_count):  # cols added
                column = self._data[i]
                cols_changed.add(column)

            # sort ascending (the client doesn't like them out of order)
            cols_changed = sorted(cols_changed, key=lambda x: x.index)

            for column in cols_changed:
                column_pb = response.schema.columns.add()
                self._populate_column_schema(column, column_pb)

            for transform in trans_changed:
                transform_pb = response.schema.transforms.add()
                self._populate_transform_schema(transform, transform_pb)

    def _parse_cells(self, request):

        if request.incData:

            selection = {
                'row_start': request.rowStart,
                'col_start': request.columnStart,
                'row_end': request.rowEnd,
                'col_end': request.columnEnd,
            }

            row_count = request.rowEnd - request.rowStart + 1
            col_count = request.columnEnd - request.columnStart + 1

            cells = [None] * col_count

            for i in range(col_count):

                cells[i] = [None] * row_count

                values = request.data[i].values

                for j in range(row_count):
                    cell_pb = values[j]
                    if cell_pb.HasField('o'):
                        cells[i][j] = None
                    elif cell_pb.HasField('d'):
                        cells[i][j] = cell_pb.d
                    elif cell_pb.HasField('i'):
                        cells[i][j] = cell_pb.i
                    elif cell_pb.HasField('s'):
                        cells[i][j] = cell_pb.s

            return cells, selection

        elif request.incCBData:

            if request.cbHtml != '':
                parser = HTMLParser()
                parser.feed(request.cbHtml)
                parser.close()
                cells = parser.result()
            else:
                parser = CSVParser()
                parser.feed(request.cbText)
                parser.close()
                cells = parser.result()

            col_end = request.columnStart + len(cells) - 1
            row_end = request.rowStart - 1
            if (len(cells) > 0):
                row_end += len(cells[0])

            selection = {
                'row_start': request.rowStart,
                'col_start': request.columnStart,
                'row_end': row_end,
                'col_end': col_end,
            }

            return cells, selection

        else:
            return [ ], { }

    def _get_column(self, index, base=0, is_display_index=False):
        column = None
        if is_display_index is True:
            count = 0
            i = 0
            while True:
                next_index = base + count + i
                if next_index >= self._data.total_column_count:
                    break
                column = self._data[next_index]
                if column.hidden is False:
                    if count == index:
                        break
                    count += 1
                else:
                    i += 1
        else:
            next_index = base + index
            if next_index < self._data.total_column_count:
                column = self._data[next_index]

        return column

    def _apply_cells(self, request, response):

        cells, selection = self._parse_cells(request)

        exclude_hidden_cols = request.excHiddenCols

        row_start = selection['row_start']
        col_start = selection['col_start']
        row_end   = selection['row_end']
        col_end   = selection['col_end']
        row_count = row_end - row_start + 1
        col_count = col_end - col_start + 1

        response.rowStart    = row_start
        response.columnStart = col_start
        response.rowEnd      = row_end
        response.columnEnd   = col_end

        if row_count == 0 or col_count == 0:
            return

        # check that the assignments are possible
        base_index = 0
        search_index = col_start
        for i in range(col_count):

            column = self._get_column(search_index, base_index, exclude_hidden_cols)

            if column is None:
                break

            base_index = column.index + 1
            search_index = 0

            if column.column_type == ColumnType.COMPUTED:
                raise TypeError("Cannot assign to computed column '{}'".format(column.name))
            elif column.column_type == ColumnType.RECODED:
                raise TypeError("Cannot assign to recoded column '{}'".format(column.name))
            elif column.column_type == ColumnType.FILTER:
                raise TypeError("Cannot assign to filter column '{}'".format(column.name))

            if column.auto_measure:
                continue  # skip checks

            values = cells[i]

            if column.data_type == DataType.DECIMAL:
                for value in values:
                    if value is not None and value != '' and not isinstance(value, int) and not isinstance(value, float):
                        raise TypeError("Cannot assign non-numeric value to column '{}'".format(column.name))

            elif column.data_type == DataType.INTEGER:
                for value in values:
                    if value is not None and value != '' and not isinstance(value, int):
                        raise TypeError("Cannot assign non-integer value to column '{}'".format(column.name))

        # assign

        n_cols_before = self._data.total_column_count
        n_rows_before = self._data.row_count

        if row_end >= self._data.row_count:
            self._data.set_row_count(row_end + 1)

        cols_changed = set()  # schema changes to send
        reparse = set()
        recalc = set()  # computed columns that need to update from these changes

        for i in range(self._data.column_count, col_start):
            column = self._data[i]
            column.realise()
            cols_changed.add(column)

        base_index = 0
        search_index = col_start
        filter_changed = False

        for i in range(col_count):
            column = self._get_column(search_index, base_index, exclude_hidden_cols)
            if column is None:
                break
            base_index = column.index + 1
            search_index = 0

            column.column_type = ColumnType.DATA
            column.needs_recalc = True  # invalidate dependent nodes

            values = cells[i]

            was_virtual = column.is_virtual
            changes = column.changes

            if column.auto_measure:  # change data type if necessary

                dt = column.data_type
                mt = column.measure_type

                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        pass
                    elif isinstance(value, float):
                        if dt is not DataType.TEXT:
                            dt = DataType.DECIMAL
                            mt = MeasureType.CONTINUOUS
                    elif isinstance(value, str):
                        dt = DataType.TEXT
                        if mt is MeasureType.CONTINUOUS:
                            mt = MeasureType.NOMINAL

                if dt != column.data_type:
                    column.change(data_type=dt, measure_type=mt)

            if column.data_type == DataType.DECIMAL:
                nan = float('nan')
                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        column[row_start + j] = nan
                    elif isinstance(value, float):
                        column[row_start + j] = value
                    elif isinstance(value, int):
                        column[row_start + j] = value
                    else:
                        raise TypeError("Cannot assign non-numeric value to column '{}'", column.name)

            elif column.data_type == DataType.TEXT:
                for j in range(row_count):
                    value = values[j]

                    if value is None or value == '':
                        column[row_start + j] = -2147483648
                    else:
                        if isinstance(value, str):
                            if value == '':
                                value = -2147483648
                        elif isinstance(value, float):
                            if math.isnan(value):
                                value = -2147483648
                            else:
                                value = str(value)
                        else:
                            value = str(value)

                        column.clear_at(row_start + j)  # necessary to clear first with TEXT

                        if value == -2147483648:
                            index = -2147483648
                        elif not column.has_level(value):
                            index = column.level_count
                            column.insert_level(index, value)
                        else:
                            index = column.get_value_for_label(value)

                        column[row_start + j] = index

            else:  # elif column.data_type == DataType.INTEGER:
                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        column[row_start + j] = -2147483648
                    elif isinstance(value, int):
                        if not column.has_level(value) and value != -2147483648:
                            column.insert_level(value, str(value))
                        column[row_start + j] = value
                    elif isinstance(value, str):
                        if column.has_level(value):
                            index = column.get_value_for_label(value)
                        else:
                            column.clear_at(row_start + j)
                            index = 0
                            for level in column.levels:
                                index = max(index, level[0])
                            index += 1
                            column.insert_level(index, value, str(index))
                        column[row_start + j] = index
                    else:
                        raise RuntimeError('Should not get here')

            if column.auto_measure:
                self._auto_adjust(column)
            elif column.data_type == DataType.DECIMAL:
                column.determine_dps()

            if changes != column.changes or was_virtual:
                # if a schema change
                cols_changed.add(column)
                # reparse dependents, as it may impact their data/measure type
                reparse.update(column.dependents)

            dependents = column.dependents
            recalc.update(dependents)
            cols_changed.update(dependents)

            for dep in dependents:
                if dep.is_filter:
                    filter_changed = True

        self._data.is_edited = True

        for i in range(n_cols_before, self._data.total_column_count):  # cols added
            column = self._data[i]
            cols_changed.add(column)

        if n_rows_before != self._data.row_count:
            recalc = self._data  # if more rows recalc all
            cols_changed = self._data  # send *all* column schemas
        else:
            # sort ascending (the client doesn't like them out of order)
            cols_changed = sorted(cols_changed, key=lambda x: x.index)

        for column in reparse:
            column.parse_formula()
        for column in recalc:
            column.needs_recalc = True
        for column in recalc:
            column.recalc()

        if filter_changed:
            self._data.update_filter_status()
            self._populate_schema(request, response)
        else:
            self._populate_schema_info(request, response)

            for column in cols_changed:
                column_pb = response.schema.columns.add()
                self._populate_column_schema(column, column_pb)

        self._populate_cells(request, response)

    def _auto_adjust(self, column):

        if column.data_type == DataType.TEXT:

            d_type = DataType.INTEGER
            m_type = MeasureType.NOMINAL

            try:
                for level in column.levels:
                    value = float(level[1])
                    if d_type is DataType.INTEGER:
                        if not math.isclose(value % 1, 0.0):
                            d_type = DataType.DECIMAL
                            m_type = MeasureType.CONTINUOUS

                column.change(data_type=d_type, measure_type=m_type)

            except ValueError:
                # don't change
                pass

        elif column.data_type == DataType.DECIMAL:
            for value in column:
                if math.isnan(value):
                    continue
                if not math.isclose(value % 1, 0.0):
                    # don't change
                    break
            else:
                column.change(
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.NOMINAL)
                return

            column.determine_dps()

    def _populate_cells(self, request, response):

        row_start = response.rowStart
        col_start = response.columnStart
        row_end   = response.rowEnd
        col_end   = response.columnEnd
        row_count = row_end - row_start + 1
        col_count = col_end - col_start + 1

        filtered = map(lambda row_no: self._data.is_row_filtered(row_no), range(row_start, row_end + 1))
        filtered = map(lambda filtered: 1 if filtered else 0, filtered)
        response.filtered = bytes(filtered)

        exclude_hidden_cols = request.excHiddenCols
        base_index = 0
        search_index = col_start
        for cc in range(col_count):

            column = self._get_column(search_index, base_index, exclude_hidden_cols)

            if column is None:
                break

            base_index = column.index + 1
            search_index = 0

            col_res = response.data.add()

            if column.data_type == DataType.DECIMAL:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    if r >= column.row_count:
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                    else:
                        value = column[r]
                        if math.isnan(value):
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            cell.d = value
            elif column.data_type == DataType.TEXT:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    if r >= column.row_count:
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                    else:
                        value = column[r]
                        if value == '':
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            cell.s = value
            else:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    if r >= column.row_count:
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                    else:
                        value = column[r]
                        if value == -2147483648:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            cell.i = value

    def _populate_schema(self, request, response):
        self._populate_schema_info(request, response)
        for column in self._data:
            column_schema = response.schema.columns.add()
            self._populate_column_schema(column, column_schema)
        for transform in self._data.transforms:
            transform_schema = response.schema.transforms.add()
            self._populate_transform_schema(transform, transform_schema)

    def _populate_schema_info(self, request, response):
        response.incSchema = True
        response.schema.rowCount = self._data.row_count
        response.schema.vRowCount = self._data.virtual_row_count
        response.schema.columnCount = self._data.column_count
        response.schema.vColumnCount = self._data.visible_column_count
        response.schema.tColumnCount = self._data.total_column_count

    def _populate_transform_schema(self, transform, transform_schema):
        transform_schema.name = transform.name
        transform_schema.id = transform.id
        for formula in transform.formula:
            transform_schema.formula.append(formula)
        for formula_msg in transform.formula_message:
            transform_schema.formulaMessage.append(formula_msg)
        transform_schema.description = transform.description

    def _populate_column_schema(self, column, column_schema):
        column_schema.name = column.name
        column_schema.importName = column.import_name
        column_schema.id = column.id
        column_schema.index = column.index

        column_schema.columnType = column.column_type.value
        column_schema.dataType = column.data_type.value
        column_schema.measureType = column.measure_type.value
        column_schema.autoMeasure = column.auto_measure

        if column.column_type is ColumnType.FILTER:
            column_schema.width = 78
        else:
            column_schema.width = 100

        column_schema.dps = column.dps
        column_schema.formula = column.formula
        column_schema.formulaMessage = column.formula_message
        column_schema.description = column.description
        column_schema.hidden = column.hidden
        column_schema.active = column.active
        column_schema.filterNo = column.filter_no
        column_schema.trimLevels = column.trim_levels
        column_schema.transform = column.transform

        column_schema.hasLevels = True

        if column.has_levels:
            for level in column.levels:
                level_pb = column_schema.levels.add()
                level_pb.value = level[0]
                level_pb.label = level[1]
                level_pb.importValue = level[2]

    def _add_to_recents(self, path):

        settings = Settings.retrieve('backstage')
        recents  = settings.get('recents', [ ])

        for recent in recents:
            if path == recent['path']:
                recents.remove(recent)
                break

        name = os.path.basename(path)
        location = os.path.dirname(path)

        location = Instance._virtualise_path(location)

        recents.insert(0, { 'name': name, 'path': path, 'location': location })
        recents = recents[0:5]

        settings.set('recents', recents)
        settings.sync()

        for instanceId, instance in Instance.instances.items():
            if instance.is_active:
                instance._on_settings()

    def _on_settings(self, request=None):

        settings = Settings.retrieve('main')

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
                    Instance._update_status_req(value)
                else:
                    settings.set(name, value)

            settings.sync()

            for instanceId, instance in Instance.instances.items():
                if instance is not self and instance.is_active:
                    instance._on_settings()

        response = jcoms.SettingsResponse()

        setting_pb = response.settings.add()
        setting_pb.name = 'updateStatus'
        setting_pb.s = Instance._update_status

        for name in settings:
            value = settings.get(name)
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

        settings = Settings.retrieve('backstage')
        recents = settings.get('recents', [ ])

        for recent in recents:
            recent_pb = response.recents.add()
            recent_pb.name = recent['name']
            recent_pb.path = recent['path']
            recent_pb.location = recent['location']

        try:
            path = os.path.join(conf.get('examples_path'), 'index.yaml')
            with open(path, encoding='utf-8') as index:
                for example in yaml.safe_load(index):
                    example_pb = response.examples.add()
                    example_pb.name = example['name']
                    example_pb.path = '{{Examples}}/' + example['path']
                    example_pb.description = example['description']
        except Exception as e:
            log.exception(e)

        for module in Modules.instance():
            module_pb = response.modules.add()
            self._module_to_pb(module, module_pb)

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
        module_pb.description = module.description
        module_pb.authors.extend(module.authors)
        module_pb.path = module.path
        module_pb.isSystem = module.is_sys
        module_pb.new = module.new
        module_pb.minAppVersion = min_version

        for analysis in module.analyses:
            analysis_pb = module_pb.analyses.add()
            analysis_pb.name = analysis.name
            analysis_pb.ns = analysis.ns
            analysis_pb.title = analysis.title
            analysis_pb.menuGroup = analysis.menuGroup
            analysis_pb.menuSubgroup = analysis.menuSubgroup
            analysis_pb.menuTitle = analysis.menuTitle
            analysis_pb.menuSubtitle = analysis.menuSubtitle

    def _on_engine_event(self, event):
        if event['type'] == 'terminated' and self._coms is not None:
            self._coms.close()

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


async def GarbageCollection():

    while True:
        await asyncio.sleep(.3)
        for id, instance in Instance.instances.items():
            if instance.inactive_for > 2:
                log.info('cleaning up: ' + str(id))
                instance.close()
                del Instance.instances[id]
                break
