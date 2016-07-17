
import os

from silky import MeasureType
from silky import Dirs
from silky import MemoryMap
from silky import DataSet

from settings import Settings

import silkycoms

from enginemanager import EngineManager
from analyses import Analyses
from fileio import FileIO

import json
import uuid


class Instance:

    instances = { }

    @staticmethod
    def get(instance_id):
        return Instance.instances.get(instance_id)

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
            print("created " + self._instance_id)

        self._instance_path = os.path.join(self._session_path, self._instance_id)
        os.makedirs(self._instance_path, exist_ok=True)
        self._buffer_path = os.path.join(self._instance_path, 'buffer')

        self._em.start(self._session_path)

        Instance.instances[self._instance_id] = self

    @property
    def id(self):
        return self._instance_id

    def set_coms(self, coms):
        self._coms = coms

    def get_path_to_resource(self, resourceId):
        resource_path = os.path.join(self._instance_path, resourceId)
        return resource_path

    def on_request(self, request):
        if type(request) == silkycoms.CellsRequest:
            self._on_cells(request)
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
        complete = (results.status == silkycoms.AnalysisStatus.ANALYSIS_COMPLETE)
        self._coms.send(results, self._instance_id, request, complete)

    def _on_fs_request(self, request):
        location = request.path

        if location.startswith('{{Documents}}'):
            location = location.replace('{{Documents}}', Dirs.documents_dir())
        if location.startswith('{{Desktop}}'):
            location = location.replace('{{Desktop}}', Dirs.desktop_dir())
        if location.startswith('{{Home}}'):
            location = location.replace('{{Home}}', Dirs.home_dir())

        response = silkycoms.FSResponse()

        try:
            contents = os.scandir(location)

            for direntry in contents:
                entry = silkycoms.FSEntry()
                entry.path = direntry.path
                if direntry.is_dir():
                    entry.type = silkycoms.FSEntry.Type.FOLDER
                else:
                    entry.type = silkycoms.FSEntry.Type.FILE
                response.contents.append(entry)

        except Exception as e:
            print(e)
            response.errorMessage = str(e)

        self._coms.send(response, self._instance_id, request)

    def _on_save(self, request):
        print('saving ' + request.filename)

        FileIO.write(self._dataset, request.filename)

        self._filepath = request.filename
        response = silkycoms.SaveProgress()
        self._coms.send(response, self._instance_id, request)

        self._add_to_recents(request.filename)

    def _on_open(self, request):
        print('opening ' + request.filename)

        mm = MemoryMap.create(self._buffer_path, 65536)
        dataset = DataSet.create(mm)

        FileIO.read(dataset, request.filename)

        self._dataset = dataset
        self._filepath = request.filename

        self._coms.send(None, self._instance_id, request)

        self._add_to_recents(request.filename)

    def _open_callback(self, task, progress):
        response = silkycoms.ComsMessage()
        response.open.status = silkycoms.Status.IN_PROGRESS
        response.open.progress = progress
        response.open.progress_task = task

        self._coms.send(response, self._instance_id)

    def _on_analysis(self, request):

        if 'analysisId' not in request:

            try:
                analysis = self._analyses.create(request.name, request.ns)
                analysisId = analysis.id
                options = json.dumps(analysis.options)

                response = silkycoms.AnalysisResponse()
                response.analysisId = analysisId
                response.options = options
                response.status = silkycoms.AnalysisStatus.ANALYSIS_NONE

                self._coms.send(response, self._instance_id, request, False)

                request.datasetId = self._instance_id
                request.analysisId = analysisId
                request.options = options
                self._em.send(request)

            except Exception as e:

                print('Could not create analysis: ' + str(e))
                self._coms.discard(request)

                # We should handle this properly at some point, something like:
                #
                # response = silkycoms.AnalysisResponse()
                # response.status = silkycoms.AnalysisStatus.ANALYSIS_ERROR
                # response.error.message = 'Could not create analysis: ' + str(e)
                #
                # self._coms.send(response, self._instance_id, request)

        else:
            analysisId = request.analysisId
            options = request.options

            request.datasetId = self._instance_id
            request.analysisId = analysisId
            request.options = options
            self._em.send(request)

    def _on_info(self, request):

        response = silkycoms.InfoResponse()

        hasDataSet = self._dataset is not None
        response.hasDataSet = hasDataSet

        if hasDataSet:
            response.filePath = self._filepath
            response.rowCount = self._dataset.row_count
            response.columnCount = self._dataset.column_count

            for column in self._dataset:

                field = silkycoms.InfoResponse.Schema.Field()
                field.name = column.name
                field.measureType = silkycoms.InfoResponse.Schema.Field.MeasureType(column.type)
                field.width = 100

                response.schema.fields.append(field)

        self._coms.send(response, self._instance_id, request)

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

            if column.type == MeasureType.CONTINUOUS:
                for r in range(rowStart, rowStart + rowCount):
                    value = column[r]
                    colRes.doubles.values.append(value)
            elif column.type == MeasureType.NOMINAL_TEXT:
                for r in range(rowStart, rowStart + rowCount):
                    value = column[r]
                    colRes.strings.values.append(value)
            else:
                for r in range(rowStart, rowStart + rowCount):
                    value = column[r]
                    colRes.ints.values.append(value)

            response.columns.append(colRes)

        self._coms.send(response, self._instance_id, request)

    def _add_to_recents(self, path):

        settings = Settings.retrieve('backstage')
        recents  = settings.get('recents', [ ])

        for recent in recents:
            if path == recent['path']:
                recents.remove(recent)
                break

        name = os.path.basename(path)
        location = os.path.dirname(path)

        documents_dir = Dirs.documents_dir()
        home_dir = Dirs.home_dir()
        desktop_dir = Dirs.desktop_dir()

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

        for instanceId, instance in Instance.instances.items():
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

        self._coms.send(response, self._instance_id, request)
