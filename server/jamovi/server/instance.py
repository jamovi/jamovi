#
# Copyright (C) 2016 Jonathon Love
#

import os
import os.path
import platform

from ..core import MeasureType
from ..core import Dirs
from ..core import MemoryMap
from ..core import DataSet

from .settings import Settings

from . import jamovi_pb2 as jcoms

from .utils import conf
from .utils.csvparser import CSVParser
from .utils.htmlparser import HTMLParser
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

import threading
from threading import Thread

from .utils import fs

log = logging.getLogger('jamovi')


class Instance:

    instances = { }
    _garbage_collector = None

    @staticmethod
    def get(instance_id):
        return Instance.instances.get(instance_id)

    class GarbageCollector:

        def __init__(self):
            self._stopped = False
            self._thread = Thread(target=self.run)
            self._thread.start()

        def run(self):
            parent = threading.main_thread()

            while True:
                time.sleep(.3)
                if self._stopped is True:
                    break
                if parent.is_alive() is False:
                    break
                for id, instance in Instance.instances.items():
                    if instance.inactive_for > 2:
                        log.info('cleaning up: ' + str(id))
                        instance.close()
                        del Instance.instances[id]
                        break

        def stop(self):
            self._stopped = True

    def _normalise_path(path):
        nor_path = path
        if path.startswith('{{Documents}}'):
            nor_path = path.replace('{{Documents}}', Dirs.documents_dir())
        elif path.startswith('{{Desktop}}'):
            nor_path = path.replace('{{Desktop}}', Dirs.desktop_dir())
        elif path.startswith('{{Home}}'):
            nor_path = path.replace('{{Home}}', Dirs.home_dir())
        elif path.startswith('{{Examples}}'):
            nor_path = path.replace('{{Examples}}', conf.get('examples_path'))
        return nor_path

    def _virtualise_path(path):
        documents_dir = Dirs.documents_dir()
        home_dir = Dirs.home_dir()
        desktop_dir = Dirs.desktop_dir()

        vir_path = path
        if path.startswith(documents_dir):
            vir_path = path.replace(documents_dir, '{{Documents}}')
        elif path.startswith(desktop_dir):
            vir_path = path.replace(desktop_dir, '{{Desktop}}')
        elif path.startswith(home_dir):
            vir_path = path.replace(home_dir, '{{Home}}')

        return vir_path

    def __init__(self, session_path, instance_id=None):

        if Instance._garbage_collector is None:
            Instance._garbage_collector = Instance.GarbageCollector()

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
        elif type(request) == jcoms.ModuleRequest:
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
        location = path

        path = Instance._normalise_path(path)

        response = jcoms.FSResponse()
        if path.startswith('{{Root}}'):

            entry = response.contents.add()
            entry.name = 'Documents'
            entry.path = '{{Documents}}'
            entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')

            entry = response.contents.add()
            entry.name = 'Desktop'
            entry.path = '{{Desktop}}'
            entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')

            entry = response.contents.add()
            entry.name = 'Home'
            entry.path = '{{Home}}'
            entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')

            if platform.uname().system == 'Windows':
                for drive_letter in range(ord('A'), ord('Z') + 1):
                    drive = chr(drive_letter) + ':'
                    if os.path.exists(drive):
                        entry = response.contents.add()
                        entry.name = drive
                        entry.path = drive
                        entry.type = jcoms.FSEntry.Type.Value('DRIVE')

            self._coms.send(response, self._instance_id, request)

        else:
            try:
                for direntry in os.scandir(path + '/'):  # add a / in case we get C:
                    if fs.is_hidden(direntry.path):
                        show = False
                    elif direntry.is_dir():
                        entry_type = jcoms.FSEntry.Type.Value('FOLDER')
                        if fs.is_link(direntry.path):
                            show = False
                        else:
                            show = True
                    else:
                        entry_type = jcoms.FSEntry.Type.Value('FILE')
                        show = formatio.is_supported(direntry.name)

                    if show:
                        entry = response.contents.add()
                        entry.name = direntry.name
                        entry.type = entry_type
                        entry.path = posixpath.join(location, direntry.name)

                self._coms.send(response, self._instance_id, request)

            except OSError as e:
                base    = os.path.basename(path)
                message = 'Unable to open {}'.format(base)
                cause = e.strerror
                self._coms.send_error(message, cause, self._instance_id, request)

    def _on_save(self, request):
        path = request.filename
        path = Instance._normalise_path(path)

        try:
            file_exists = os.path.isfile(path)
            if file_exists is False or request.overwrite is True:
                if request.incContent:
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

        formatio.write(self._data, path)

        if not is_export:
            self._data.title = os.path.splitext(os.path.basename(path))[0]
            self._data.path = path
            self._data.is_edited = False

        response = jcoms.SaveProgress()
        response.success = True
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
        nor_path = Instance._normalise_path(path)

        self._mm = MemoryMap.create(self._buffer_path, 65536)
        dataset = DataSet.create(self._mm)

        try:
            self._data.dataset = dataset

            is_example = path.startswith('{{Examples}}')
            formatio.read(self._data, nor_path, is_example)
            self._coms.send(None, self._instance_id, request)

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
            if request.perform is jcoms.AnalysisRequest.Perform.Value('DELETE'):
                del self._data.analyses[request.analysisId]
            else:
                analysis.set_options(request.options, request.changed)

        else:  # create analysis
            try:
                analysis = self._data.analyses.create(request.analysisId, request.name, request.ns, request.options)
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
            response.path = self._data.path
            response.edited = self._data.is_edited
            response.blank = self._data.is_blank

            response.schema.rowCount = self._data.row_count
            response.schema.vRowCount = self._data.virtual_row_count
            response.schema.columnCount = self._data.column_count
            response.schema.vColumnCount = self._data.virtual_column_count

            for column in self._data:
                column_schema = response.schema.columns.add()
                self._populate_column_schema(column, column_schema)

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
            else:
                self._on_dataset_get(request, response)

            self._coms.send(response, self._instance_id, request)

        except TypeError as e:
            self._coms.send_error('Could not assign data', str(e), self._instance_id, request)
        except Exception as e:
            log.exception(e)
            self._coms.send_error('Could not assign data', str(e), self._instance_id, request)

    def _on_module(self, request):

        modules = Modules.instance()

        if request.command == jcoms.ModuleRequest.ModuleCommand.Value('INSTALL'):
            modules.install(
                request.path,
                lambda t, result: self._on_module_callback(t, result, request))
        elif request.command == jcoms.ModuleRequest.ModuleCommand.Value('UNINSTALL'):
            try:
                modules.uninstall(request.name)
                self._coms.send(None, self._instance_id, request)
                self._notify_modules_changed()
            except Exception as e:
                log.exception(e)
                self._coms.send_error(str(e), None, self._instance_id, request)

    def _on_module_callback(self, t, result, request):
        if t == 'progress':
            progress = jcoms.Progress()
            progress.progress = result[0]
            progress.total = result[1]
            self._coms.send(progress, self._instance_id, request, complete=False)
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
            progress = jcoms.Progress()
            progress.progress = result[0]
            progress.total = result[1]
            self._coms.send(progress, self._instance_id, request, complete=False)
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

    def _apply_schema(self, request, response):

        n_cols_before = self._data.virtual_column_count

        min_index = self._data.virtual_column_count

        for column_schema in request.schema.columns:
            column = self._data.get_column_by_id(column_schema.id)
            if column.index < min_index:
                min_index = column.index

        for i in range(self._data.column_count, min_index):
            column = self._data[i]
            column.realise()
            response.incSchema = True
            schema = response.schema.columns.add()
            self._populate_column_schema(column, schema)

        for column_schema in request.schema.columns:
            column = self._data.get_column_by_id(column_schema.id)

            levels = None
            if column_schema.hasLevels:
                levels = [ ]
                for level in column_schema.levels:
                    levels.append((level.value, level.label))

            column.change(column_schema.measureType, column_schema.name, levels, auto_measure=column_schema.autoMeasure)

            response.incSchema = True
            schema = response.schema.columns.add()
            self._populate_column_schema(column, schema)

        self._data.is_edited = True

        for i in range(n_cols_before, self._data.virtual_column_count):  # cols added
            column = self._data[i]
            schema = response.schema.columns.add()
            self._populate_column_schema(column, schema)

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

    def _apply_cells(self, request, response):

        cells, selection = self._parse_cells(request)

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

        for i in range(col_count):
            index = col_start + i
            if index >= self._data.column_count:
                break
            column = self._data[index]
            if column.auto_measure:
                continue

            values = cells[i]

            if column.measure_type == MeasureType.CONTINUOUS:
                for value in values:
                    if value is not None and value != '' and not isinstance(value, int) and not isinstance(value, float):
                        raise TypeError("Cannot assign non-numeric value to column '{}'".format(column.name))

            elif column.measure_type == MeasureType.NOMINAL or column.measure_type == MeasureType.ORDINAL:
                for value in values:
                    if value is not None and value != '' and not isinstance(value, int):
                        raise TypeError("Cannot assign non-interger value to column '{}'".format(column.name))

        # assign

        n_cols_before = self._data.virtual_column_count

        if row_end >= self._data.row_count:
            self._data.set_row_count(row_end + 1)

        for i in range(self._data.column_count, col_start):
            column = self._data[i]
            column.realise()
            response.incSchema = True
            schema = response.schema.columns.add()
            self._populate_column_schema(column, schema)

        for i in range(col_count):
            column = self._data[col_start + i]

            values = cells[i]

            was_virtual = column.is_virtual
            changes = column.changes

            if column.auto_measure:  # change column type if necessary

                mt = column.measure_type

                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        pass
                    elif isinstance(value, float):
                        if mt is not MeasureType.NOMINAL_TEXT:
                            mt = MeasureType.CONTINUOUS
                    elif isinstance(value, int):
                        if mt is not MeasureType.NOMINAL_TEXT and mt is not MeasureType.CONTINUOUS:
                            mt = MeasureType.NOMINAL
                    elif isinstance(value, str):
                        mt = MeasureType.NOMINAL_TEXT

                if mt != column.measure_type:
                    column.change(mt)

            if column.measure_type == MeasureType.CONTINUOUS:
                nan = float('nan')
                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        column[row_start + j] = nan
                    elif isinstance(value, float):
                        column[row_start + j] = value
                    elif isinstance(value, int):
                        column[row_start + j] = value
                    elif isinstance(value, str) and column.auto_measure:
                        column.change(MeasureType.NOMINAL_TEXT)
                        index = column.level_count
                        column.insert_level(index, value)
                        column[row_start + j] = index
                    else:
                        raise TypeError("Cannot assign non-numeric value to column '{}'", column.name)

            elif column.measure_type == MeasureType.NOMINAL_TEXT:
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

                        column.clear_at(row_start + j)  # necessary to clear first with NOMINAL_TEXT

                        if value == -2147483648:
                            index = -2147483648
                        elif not column.has_level(value):
                            index = column.level_count
                            column.insert_level(index, value)
                        else:
                            index = column.get_value_for_label(value)
                        column[row_start + j] = index
            else:
                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        column[row_start + j] = -2147483648
                    elif isinstance(value, int):
                        if not column.has_level(value) and value != -2147483648:
                            column.insert_level(value, str(value))
                        column[row_start + j] = value
                    elif isinstance(value, float) and column.auto_measure:
                        column.change(MeasureType.CONTINUOUS)
                        column[row_start + j] = value
                    elif isinstance(value, str) and column.auto_measure:
                        column.change(MeasureType.NOMINAL_TEXT)
                        column.clear_at(row_start + j)  # necessary to clear first with NOMINAL_TEXT
                        index = column.level_count
                        column.insert_level(index, value)
                        column[row_start + j] = index

            if column.auto_measure:
                self._auto_adjust(column)
            elif column.measure_type == MeasureType.CONTINUOUS:
                column.determine_dps()

            if changes != column.changes or was_virtual:
                response.incSchema = True
                columnPB = response.schema.columns.add()
                self._populate_column_schema(column, columnPB)

        self._data.is_edited = True

        for i in range(n_cols_before, self._data.virtual_column_count):  # cols added
            column = self._data[i]
            columnPB = response.schema.columns.add()
            self._populate_column_schema(column, columnPB)

        response.schema.rowCount = self._data.row_count
        response.schema.vRowCount = self._data.virtual_row_count
        response.schema.columnCount = self._data.column_count
        response.schema.vColumnCount = self._data.virtual_column_count

        self._populate_cells(request, response)

    def _auto_adjust(self, column):
        if column.measure_type == MeasureType.NOMINAL_TEXT:
            for level in column.levels:
                try:
                    int(level[1])
                except ValueError:
                    break
            else:
                column.change(MeasureType.NOMINAL)
                return

            for level in column.levels:
                try:
                    float(level[1])
                except ValueError:
                    break
            else:
                column.change(MeasureType.CONTINUOUS)
                return

        elif column.measure_type == MeasureType.CONTINUOUS:
            for value in column:
                if math.isnan(value):
                    continue
                if round(value) != round(value, 6):
                    break
            else:
                column.change(MeasureType.NOMINAL)
                return

            column.determine_dps()

    def _populate_cells(self, request, response):

        row_start = response.rowStart
        col_start = response.columnStart
        row_end   = response.rowEnd
        col_end   = response.columnEnd
        row_count = row_end - row_start + 1
        col_count = col_end - col_start + 1

        for c in range(col_start, col_start + col_count):
            column = self._data[c]

            col_res = response.data.add()

            if column.measure_type == MeasureType.CONTINUOUS:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    value = column[r]
                    if math.isnan(value):
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                    else:
                        cell.d = value
            elif column.measure_type == MeasureType.NOMINAL_TEXT:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    value = column[r]
                    if value == '':
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                    else:
                        cell.s = value
            else:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    value = column[r]
                    if value == -2147483648:
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                    else:
                        cell.i = value

    def _populate_schema(self, request, response):
        response.incSchema = True
        for column in self._data:
            column_schema = response.schema.columns.add()
            self._populate_column_schema(column, column_schema)
        response.schema.rowCount = self._data.row_count
        response.schema.vRowCount = self._data.virtual_row_count
        response.schema.columnCount = self._data.column_count
        response.schema.vColumnCount = self._data.virtual_column_count

    def _populate_column_schema(self, column, column_schema):
        column_schema.name = column.name
        column_schema.importName = column.import_name
        column_schema.id = column.id
        column_schema.index = column.index

        column_schema.measureType = column.measure_type.value
        column_schema.autoMeasure = column.auto_measure
        column_schema.width = 100
        column_schema.dps = column.dps

        column_schema.hasLevels = True

        if column.measure_type is MeasureType.NOMINAL_TEXT:
            for level in column.levels:
                level_pb = column_schema.levels.add()
                level_pb.label = level[1]
        elif column.measure_type is MeasureType.NOMINAL or column.measure_type is MeasureType.ORDINAL:
            for level in column.levels:
                level_pb = column_schema.levels.add()
                level_pb.value = level[0]
                level_pb.label = level[1]

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

        settings = Settings.retrieve('backstage')

        recents = settings.get('recents', [ ])

        response = jcoms.SettingsResponse()

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
        module_pb.name = module.name
        module_pb.title = module.title
        module_pb.version.major = module.version[0]
        module_pb.version.minor = module.version[1]
        module_pb.version.revision = module.version[2]
        module_pb.description = module.description
        module_pb.authors.extend(module.authors)
        module_pb.path = module.path
        module_pb.isSystem = module.is_sys
        module_pb.new = module.new

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
