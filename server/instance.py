
import os

from silky import ColumnType
from silky import Dirs
from silky import TempFiles
from silky import MemoryMap
from silky import DataSet

import formatio.csv

from settings import Settings

import silkycoms

from enginemanager import EngineManager
from analyses import Analyses

import json


class Instance:

    def __init__(self):

        self._coms = None
        self._dataset = None
        self._analyses = Analyses()
        self._em = EngineManager()

        self._em.add_results_listener(self._on_results)

        self._em.start()

        settings = Settings.retrieve()
        settings.sync()

    def set_coms(self, coms):
        self._coms = coms

    def on_request(self, request):
        if type(request) == silkycoms.OpenRequest:
            self._on_open(request)
        elif type(request) == silkycoms.InfoRequest:
            self._on_info(request)
        elif type(request) == silkycoms.CellsRequest:
            self._on_cells(request)
        elif type(request) == silkycoms.SettingsRequest:
            self._on_settings(request)
        elif type(request) == silkycoms.AnalysisRequest:
            self._on_analysis(request)
        else:
            print('unrecognised request')
            print(request.payloadType)

    def _on_results(self, results, request, complete):

        self._coms.send(results, request, complete)

    def _on_open(self, request):
        print('opening ' + request.filename)

        TempFiles.init(os.getpid())
        TempFiles.delete_orphans()
        path = TempFiles.create_specific('', 'data')

        mm = MemoryMap.create(path, 65536)
        dataset = DataSet.create(mm)

        formatio.csv.read(dataset, request.filename)

        self._dataset = dataset

        self._coms.send(None, request)

        self._addToRecents(request.filename)

    def _openCallback(self, task, progress):
        response = silkycoms.ComsMessage()
        response.open.status = silkycoms.Status.IN_PROGRESS
        response.open.progress = progress
        response.open.progress_task = task

        self._coms.send(response)

    def _on_analysis(self, request):
        analysis = self._analyses.create(request.name, request.ns)
        options = json.dumps(analysis.options)

        response = silkycoms.AnalysisResponse()
        response.id = analysis.id
        response.options = options
        response.status = silkycoms.AnalysisStatus.ANALYSIS_INITING

        self._coms.send(response, request, False)

        request.options = options
        self._em.send(request)

    def _on_info(self, request):

        response = silkycoms.InfoResponse()

        hasDataSet = self._dataset is not None
        response.hasDataSet = hasDataSet

        if hasDataSet:

            response.rowCount = self._dataset.rowCount()
            response.columnCount = self._dataset.columnCount()

            for column in self._dataset:

                field = silkycoms.InfoResponse.Schema.Field()
                field.name = column.name()
                field.measureType = silkycoms.InfoResponse.Schema.Field.MeasureType(column.column_type)
                field.width = 100

                response.schema.fields.append(field)

        self._coms.send(response, request)

    def _on_cells(self, request):

        if self._dataset is None:
            return None

        rowStart = request.rowStart
        colStart = request.columnStart
        rowEnd   = request.rowEnd
        colEnd   = request.columnEnd
        rowCount = rowEnd - rowStart + 1
        colCount = colEnd - colStart + 1

        response = silkycoms.CellsResponse()

        response.request.rowStart    = rowStart
        response.request.columnStart = colStart
        response.request.rowEnd      = rowEnd
        response.request.columnEnd   = colEnd

        dataset = self._dataset

        for c in range(colStart, colStart + colCount):
            column = dataset[c]

            colRes = silkycoms.CellsResponse.Column()

            if column.column_type == ColumnType.CONTINUOUS:
                for r in range(rowStart, rowStart + rowCount):
                    value = column[r]
                    colRes.doubles.values.append(value)
            elif column.column_type == ColumnType.NOMINAL_TEXT:
                for r in range(rowStart, rowStart + rowCount):
                    value = column[r]
                    colRes.strings.values.append(value)
            else:
                for r in range(rowStart, rowStart + rowCount):
                    value = column[r]
                    colRes.ints.values.append(value)

            response.columns.append(colRes)

        self._coms.send(response, request)

    def _addToRecents(self, path):

        settings = Settings.retrieve('backstage')
        recents  = settings.get('recents', [ ])

        for recent in recents:
            if path == recent['path']:
                recents.remove(recent)
                break

        name = os.path.basename(path)
        location = os.path.dirname(path)

        documents_dir = Dirs.documentsDir()
        home_dir = Dirs.homeDir()
        desktop_dir = Dirs.desktopDir()

        if location.startswith(documents_dir):
            location = location.replace(documents_dir, '{{Documents}}')
        if location.startswith(desktop_dir):
            location = location.replace(desktop_dir, '{{Desktop}}')
        if location.startswith(home_dir):
            location = location.replace(home_dir, '{{Home}}')

        recents.insert(0, { 'name': name, 'path': path, 'location': location })
        recents = recents[0:5]

        settings.set('recents', recents)
        settings.sync()

        self._on_settings()

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
            recentEntry = silkycoms.DataSetEntry()
            recentEntry.name = recent['name']
            recentEntry.path = recent['path']
            recentEntry.location = recent['location']

            response.recents.append(recentEntry)

        for localFSRecent in localFSRecents:
            recent = silkycoms.DataSetEntry()
            recent.name = localFSRecent['name']
            recent.path = localFSRecent['path']

            response.localFSRecents.append(recent)

        self._coms.send(response, request)
