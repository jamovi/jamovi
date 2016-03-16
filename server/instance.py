
import os
import time

from silky import ColumnType
from silky import Dirs
from silky import TempFiles
from silky import MemoryMap
from silky import DataSet

import formatio.csv

from settings import Settings

import clientcoms

from enginemanager import EngineManager
from analyses import Analyses

import json


class Instance:

    def __init__(self):
        self._handlers = [ ]
        self._id = None
        self._awaitingFirstHandler = True
        self._timeSinceLastHandler = time.time()
        self._dataset = None
        self._analyses = Analyses()
        self._em = EngineManager()

        self._em.start()

        settings = Settings.retrieve()
        settings.sync()

    def on_request(self, request):
        self._id = request.id

        if 'open' in request:
            self.open(request.open)
        elif 'info' in request:
            self.info(request.info)
        elif 'cells' in request:
            self.cells(request.cells)
        elif 'settings' in request:
            self.settings(request.settings)
        elif 'analysis' in request:
            self.analysis(request.analysis)
        else:
            print('unrecognised request')
            print(request)

    def open(self, request):
        print('opening ' + request.filename)

        TempFiles.init(os.getpid())
        TempFiles.delete_orphans()
        path = TempFiles.create_specific('', 'data')

        mm = MemoryMap.create(path, 65536)
        dataset = DataSet.create(mm)

        formatio.csv.read(dataset, request.filename)

        self._dataset = dataset

        response = clientcoms.Response()
        response.status = clientcoms.Status.COMPLETE
        response.progress = 100

        self._send(response)

        self._addToRecents(request.filename)

    def _openCallback(self, task, progress):
        response = clientcoms.Response()
        response.open.status = clientcoms.Status.IN_PROGRESS
        response.open.progress = progress
        response.open.progress_task = task

        self._send(response)

    def _send(self, response):
        response.id = self._id
        for handler in self._handlers:
            handler(response)

    def addHandler(self, fun):
        self._awaitingFirstHandler = False
        self._handlers.append(fun)

    def removeHandler(self, fun):
        self._handlers.remove(fun)
        if self.hasHandlers() is False:
            self._timeSinceLastHandler = time.time()

    def hasHandlers(self):
        return self._awaitingFirstHandler or len(self._handlers) != 0

    def timeWithoutHandlers(self):
        return time.time() - self._timeSinceLastHandler

    def analysis(self, a):
        analysis = self._analyses.create(a.name, a.ns)

        response = clientcoms.Response()
        response.status = clientcoms.Status.IN_PROGRESS
        response.analysis.analysisId = analysis.id
        response.analysis.options = json.dumps(analysis.options)

        self._send(response)

    def info(self, id):
        response = clientcoms.Response()

        hasDataSet = self._dataset is not None
        response.info.hasDataSet = hasDataSet

        if hasDataSet:

            response.info.rowCount = self._dataset.rowCount()
            response.info.columnCount = self._dataset.columnCount()

            for column in self._dataset:

                field = clientcoms.InfoResParams.Schema.Field()
                field.name = column.name()
                field.measureType = clientcoms.InfoResParams.Schema.Field.MeasureType(column.column_type)
                field.width = 100

                response.info.schema.fields.append(field)

        self._send(response)

    def cells(self, request):

        response = clientcoms.Response()

        if self._dataset is None:
            return None

        rowStart = request.rowStart
        colStart = request.columnStart
        rowEnd   = request.rowEnd
        colEnd   = request.columnEnd
        rowCount = rowEnd - rowStart + 1
        colCount = colEnd - colStart + 1

        response.cells.reqParams.rowStart    = rowStart
        response.cells.reqParams.columnStart = colStart
        response.cells.reqParams.rowEnd      = rowEnd
        response.cells.reqParams.columnEnd   = colEnd

        dataset = self._dataset

        for c in range(colStart, colStart + colCount):
            column = dataset[c]

            colRes = clientcoms.CellsResParams.Column()

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

            response.cells.columns.append(colRes)

        self._send(response)

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

        self.settings()

    def settings(self, request=None):

        response = clientcoms.Response()
        settings = Settings.retrieve('backstage')

        localFSRecents = settings.get('localFSRecents')
        if localFSRecents is None:
            localFSRecents = [
                { 'name': '{{Documents}}', 'path': '{{Documents}}' },
                { 'name': '{{Desktop}}',   'path': '{{Desktop}}' } ]

        recents = settings.get('recents', [ ])

        for recent in recents:
            recentEntry = clientcoms.DataSetEntry()
            recentEntry.name = recent['name']
            recentEntry.path = recent['path']
            recentEntry.location = recent['location']

            response.settings.recents.append(recentEntry)

        for localFSRecent in localFSRecents:
            recent = clientcoms.DataSetEntry()
            recent.name = localFSRecent['name']
            recent.path = localFSRecent['path']

            response.settings.localFSRecents.append(recent)

        self._send(response)
