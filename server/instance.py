#
# Copyright (C) 2016 Jonathon Love
#

import os
import platform

from silky import MeasureType
from silky import Dirs
from silky import MemoryMap
from silky import DataSet

from settings import Settings

import silkycoms_pb2 as silkycoms

from enginemanager import EngineManager
from analyses import Analyses
import formatio

import json
import uuid
import posixpath
import math

import utils.winjunclib


class Instance:

    instances = { }

    @staticmethod
    def get(instance_id):
        return Instance.instances.get(instance_id)

    def _normalise_path(path):
        nor_path = path
        if path.startswith('{{Documents}}'):
            nor_path = path.replace('{{Documents}}', Dirs.documents_dir())
        elif path.startswith('{{Desktop}}'):
            nor_path = path.replace('{{Desktop}}', Dirs.desktop_dir())
        elif path.startswith('{{Home}}'):
            nor_path = path.replace('{{Home}}', Dirs.home_dir())
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

        self._coms = None
        self._dataset = None
        self._filepath = None
        self._analyses = Analyses()
        self._em = EngineManager()

        self._session_path = session_path

        self._em.add_results_listener(self._on_results)

        settings = Settings.retrieve()
        settings.sync()

        if instance_id is not None:
            self._instance_id = instance_id
        else:
            self._instance_id = str(uuid.uuid4())

        self._instance_path = os.path.join(self._session_path, self._instance_id)
        os.makedirs(self._instance_path, exist_ok=True)
        self._buffer_path = os.path.join(self._instance_path, 'buffer')

        self._em.start(self._session_path)

        Instance.instances[self._instance_id] = self

    @property
    def id(self):
        return self._instance_id

    def set_coms(self, coms):
        if self._coms is not None:
            self._coms.remove_close_listener(self._close)
        self._coms = coms
        self._coms.add_close_listener(self._close)

    def _close(self):
        self._coms.remove_close_listener(self._close)
        self._coms = None

    @property
    def is_active(self):
        return self._coms is not None

    def get_path_to_resource(self, resourceId):
        return os.path.join(self._instance_path, resourceId)

    def on_request(self, request):
        if type(request) == silkycoms.DataSetRR:
            self._on_dataset(request)
        elif type(request) == silkycoms.OpenRequest:
            self._on_open(request)
        elif type(request) == silkycoms.SaveRequest:
            self._on_save(request)
        elif type(request) == silkycoms.InfoRequest:
            self._on_info(request)
        elif type(request) == silkycoms.SettingsRequest:
            self._on_settings(request)
        elif type(request) == silkycoms.AnalysisRequest:
            self._on_analysis(request)
        elif type(request) == silkycoms.FSRequest:
            self._on_fs_request(request)
        else:
            print('unrecognised request')
            print(request.payloadType)

    def _on_results(self, results, request, complete):
        complete = (results.status == silkycoms.AnalysisStatus.Value('ANALYSIS_COMPLETE'))
        self._coms.send(results, self._instance_id, request, complete)

    def _on_fs_request(self, request):
        path = request.path
        location = path

        path = Instance._normalise_path(path)

        response = silkycoms.FSResponse()
        if path.startswith('{{Root}}'):

            entry = response.contents.add()
            entry.name = 'Documents'
            entry.path = '{{Documents}}'
            entry.type = silkycoms.FSEntry.Type.Value('SPECIAL_FOLDER')

            entry = response.contents.add()
            entry.name = 'Desktop'
            entry.path = '{{Desktop}}'
            entry.type = silkycoms.FSEntry.Type.Value('SPECIAL_FOLDER')

            entry = response.contents.add()
            entry.name = 'Home'
            entry.path = '{{Home}}'
            entry.type = silkycoms.FSEntry.Type.Value('SPECIAL_FOLDER')

            if platform.uname().system == 'Windows':
                for drive_letter in range(ord('A'), ord('Z') + 1):
                    drive = chr(drive_letter) + ':'
                    if os.path.exists(drive):
                        entry = response.contents.add()
                        entry.name = drive
                        entry.path = drive
                        entry.type = silkycoms.FSEntry.Type.Value('DRIVE')

            self._coms.send(response, self._instance_id, request)

        else:
            try:
                for direntry in os.scandir(path + '/'):  # add a / in case we get C:
                    if direntry.is_dir():
                        entry_type = silkycoms.FSEntry.Type.Value('FOLDER')
                        if utils.winjunclib.islink(direntry.path):
                            is_valid = False
                        else:
                            is_valid = True
                    else:
                        entry_type = silkycoms.FSEntry.Type.Value('FILE')
                        is_valid = formatio.is_supported(direntry.name)

                    if is_valid:
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
        formatio.write(self._dataset, request.filename)

        self._filepath = request.filename
        response = silkycoms.SaveProgress()
        self._coms.send(response, self._instance_id, request)

        self._add_to_recents(request.filename)

    def _on_open(self, request):
        path = request.filename
        path = Instance._normalise_path(path)

        mm = MemoryMap.create(self._buffer_path, 65536)
        dataset = DataSet.create(mm)

        try:
            formatio.read(dataset, path)
            self._dataset = dataset
            self._filepath = path

            self._coms.send(None, self._instance_id, request)

            if path != '':
                self._add_to_recents(path)

        except OSError as e:
            base    = os.path.basename(path)
            message = 'Unable to open {}'.format(base)
            cause = e.strerror

            self._coms.send_error(message, cause, self._instance_id, request)

    def _open_callback(self, task, progress):
        response = silkycoms.ComsMessage()
        response.open.status = silkycoms.Status.Value('IN_PROGRESS')
        response.open.progress = progress
        response.open.progress_task = task

        self._coms.send(response, self._instance_id)

    def _on_analysis(self, request):

        if request.HasField('options'):

            analysisId = request.analysisId
            options = request.options

            request.datasetId = self._instance_id
            request.analysisId = analysisId
            request.options = options
            self._em.send(request)

        else:
            try:
                analysis = self._analyses.create(request.analysisId, request.name, request.ns)
                analysisId = request.analysisId
                options = json.dumps(analysis.options)

                response = silkycoms.AnalysisResponse()
                response.analysisId = analysisId
                response.options = options
                response.status = silkycoms.AnalysisStatus.Value('ANALYSIS_NONE')

                self._coms.send(response, self._instance_id, request, False)

                request.datasetId = self._instance_id
                request.analysisId = analysisId
                request.options = options
                self._em.send(request)

            except OSError as e:

                print('Could not create analysis: ' + str(e))
                self._coms.discard(request)

                # We should handle this properly at some point, something like:
                #
                # response = silkycoms.AnalysisResponse()
                # response.status = silkycoms.AnalysisStatus.ANALYSIS_ERROR
                # response.error.message = 'Could not create analysis: ' + str(e)
                #
                # self._coms.send(response, self._instance_id, request)

    def _on_info(self, request):

        response = silkycoms.InfoResponse()

        hasDataSet = self._dataset is not None
        response.hasDataSet = hasDataSet

        if hasDataSet:
            response.filePath = self._filepath
            response.rowCount = self._dataset.row_count
            response.columnCount = self._dataset.column_count

            for column in self._dataset:
                column_schema = response.schema.columns.add()
                self._populate_column_schema(column, column_schema)

        self._coms.send(response, self._instance_id, request)

    def _on_dataset(self, request):

        if self._dataset is None:
            return

        response = silkycoms.DataSetRR()

        response.op = request.op
        response.rowStart    = request.rowStart
        response.columnStart = request.columnStart
        response.rowEnd      = request.rowEnd
        response.columnEnd   = request.columnEnd

        if request.op == silkycoms.GetSet.Value('SET'):
            self._on_dataset_set(request, response)
        else:
            self._on_dataset_get(request, response)

        self._coms.send(response, self._instance_id, request)

    def _on_dataset_set(self, request, response):
        if request.incData:
            self._apply_cells(request, response)
        if request.incSchema:
            self._apply_schema(request, response)

    def _on_dataset_get(self, request, response):
        if request.incSchema:
            self._populate_schema(request, response)
        if request.incData:
            self._populate_cells(request, response)

    def _apply_schema(self, request, response):
        for i in range(len(request.schema)):
            column_schema = request.schema[i]
            column = self._dataset[column_schema.name]

            levels = None
            if column_schema.hasLevels:
                levels = [ ]
                for level in column_schema.levels:
                    levels.append((level.value, level.label))

            column.change(column_schema.measureType, levels, auto_measure=column_schema.autoMeasure)

            response.incSchema = True
            schema = response.schema.add()
            self._populate_column_schema(column, schema)

    def _apply_cells(self, request, response):
        row_start = request.rowStart
        col_start = request.columnStart
        row_end   = request.rowEnd
        col_end   = request.columnEnd
        row_count = row_end - row_start + 1
        col_count = col_end - col_start + 1

        for i in range(col_count):
            column = self._dataset[col_start + i]
            col_res = request.data[i]

            changes = column.changes

            if column.measure_type == MeasureType.CONTINUOUS:
                nan = float('nan')
                for j in range(row_count):
                    cell = col_res.values[j]
                    if cell.HasField('o'):
                        if cell.o == silkycoms.SpecialValues.Value('MISSING'):
                            column[row_start + j] = nan
                    elif cell.HasField('d'):
                        column[row_start + j] = cell.d
                    elif cell.HasField('i'):
                        column[row_start + j] = cell.i
                    elif cell.HasField('s') and column.auto_measure:
                        column.change(MeasureType.NOMINAL_TEXT)
                        index = column.level_count
                        column.insert_level(index, cell.s)
                        column[row_start + j] = index

            elif column.measure_type == MeasureType.NOMINAL_TEXT:
                for j in range(row_count):
                    cell = col_res.values[j]
                    if cell.HasField('o'):
                        if cell.o == silkycoms.SpecialValues.Value('MISSING'):
                            column[row_start + j] = -2147483648
                    else:
                        if cell.HasField('s'):
                            value = cell.s
                            if value == '':
                                value = -2147483648
                        elif cell.HasField('d'):
                            value = cell.d
                            if math.isnan(value):
                                value = -2147483648
                            else:
                                value = str(value)
                        else:
                            value = cell.i

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
                    cell = col_res.values[j]
                    if cell.HasField('o'):
                        if cell.o == silkycoms.SpecialValues.Value('MISSING'):
                            column[row_start + j] = -2147483648
                    elif cell.HasField('i'):
                        value = cell.i
                        if not column.has_level(value) and value != -2147483648:
                            column.insert_level(value, str(value))
                        column[row_start + j] = value
                    elif cell.HasField('d') and column.auto_measure:
                        column.change(MeasureType.CONTINUOUS)
                        column[row_start + j] = cell.d
                    elif cell.HasField('s') and column.auto_measure:
                        column.change(MeasureType.NOMINAL_TEXT)
                        column.clear_at(row_start + j)  # necessary to clear first with NOMINAL_TEXT
                        value = cell.s
                        index = column.level_count
                        column.insert_level(index, value)
                        column[row_start + j] = index

            if column.auto_measure:
                self._auto_adjust(column)
            elif column.measure_type == MeasureType.CONTINUOUS:
                column.determine_dps()

            if changes != column.changes:
                response.incSchema = True
                schema = response.schema.add()
                self._populate_column_schema(column, schema)

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

        row_start = request.rowStart
        col_start = request.columnStart
        row_end   = request.rowEnd
        col_end   = request.columnEnd
        row_count = row_end - row_start + 1
        col_count = col_end - col_start + 1

        for c in range(col_start, col_start + col_count):
            column = self._dataset[c]

            col_res = response.data.add()

            if column.measure_type == MeasureType.CONTINUOUS:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    value = column[r]
                    if math.isnan(value):
                        cell.o = silkycoms.SpecialValues.Value('MISSING')
                    else:
                        cell.d = value
            elif column.measure_type == MeasureType.NOMINAL_TEXT:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    value = column[r]
                    if value == '':
                        cell.o = silkycoms.SpecialValues.Value('MISSING')
                    else:
                        cell.s = value
            else:
                for r in range(row_start, row_start + row_count):
                    cell = col_res.values.add()
                    value = column[r]
                    if value == -2147483648:
                        cell.o = silkycoms.SpecialValues.Value('MISSING')
                    else:
                        cell.i = value

    def _populate_schema(self, request, response):
        response.incSchema = True
        for column in self._dataset:
            column_schema = response.schema.add()
            self._populate_column_schema(column, column_schema)

    def _populate_column_schema(self, column, column_schema):
        column_schema.name = column.name
        column_schema.measureType = column.measure_type.value
        column_schema.autoMeasure = column.auto_measure
        column_schema.width = 100
        column_schema.dps = column.dps

        column_schema.hasLevels = True

        if column.measure_type is MeasureType.NOMINAL_TEXT:
            for level in column.levels:
                levelEntry = column_schema.levels.add()
                levelEntry.label = level[1]
        elif column.measure_type is MeasureType.NOMINAL or column.measure_type is MeasureType.ORDINAL:
            for level in column.levels:
                levelEntry = column_schema.levels.add()
                levelEntry.value = level[0]
                levelEntry.label = level[1]

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

        localFSRecents = settings.get('localFSRecents')
        if localFSRecents is None:
            localFSRecents = [
                { 'name': '{{Documents}}', 'path': '{{Documents}}' },
                { 'name': '{{Desktop}}',   'path': '{{Desktop}}' } ]

        recents = settings.get('recents', [ ])

        response = silkycoms.SettingsResponse()

        for recent in recents:
            recentEntry = response.recents.add()
            recentEntry.name = recent['name']
            recentEntry.path = recent['path']
            recentEntry.location = recent['location']

        for localFSRecent in localFSRecents:
            recentEntry = response.localFSRecents.add()
            recentEntry.name = localFSRecent['name']
            recentEntry.path = localFSRecent['path']

        self._coms.send(response, self._instance_id, request)
