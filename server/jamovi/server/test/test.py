
import unittest

import os
import os.path
import time
import tempfile

from silky import MemoryMap
from silky import DataSet
from server.formatio import csv
from server import jamovi_pb2 as jcoms
from server.enginemanager import EngineManager


class TestEngine(unittest.TestCase):

    def setUp(self):
        self._results = None
        self._temp_dir = tempfile.TemporaryDirectory()
        self._temp_path = self._temp_dir.name
        self._instance_path = os.path.join(self._temp_path, 'instance')
        self._buffer_path = os.path.join(self._instance_path, 'buffer')

        os.makedirs(self._instance_path)

        self._em = EngineManager()
        self._em.start(self._temp_path)
        self._em.add_results_listener(self._on_results)

    def tearDown(self):
        self._temp_dir.cleanup()

    def _on_results(self, results, request, complete):
        self._results = results

    def _open(self):
        here = os.path.dirname(os.path.realpath(__file__))
        data_path = os.path.join(here, 'data.csv')

        mm = MemoryMap.create(self._buffer_path, 65536)
        dataset = DataSet.create(mm)

        csv.read(dataset, data_path)

    def _wait_for_results(self, timeout=3000):
        startTime = time.time()
        while self._results is None:
            time.sleep(0.005)
            elapsed = time.time() - startTime
            if elapsed > (timeout / 1000):
                raise TimeoutError()
        results = self._results
        self._results = None
        return results

    def test_desc(self):
        self._open()

        request = jcoms.AnalysisRequest()
        request.ns = 'jmv'
        request.name = 'Descriptives'
        request.datasetId = 'instance'
        request.analysisId = 1
        request.options = '{ "vars": [ "a", "b", "f" ]}'
        request.perform = jcoms.AnalysisRequest.Perform.Value('RUN')

        self._em.send(request)
        results = self._wait_for_results()

        request.options = '{ "vars": [ "a", "b", "f" ], "freq": true}'
        request.perform = jcoms.AnalysisRequest.Perform.Value('INIT')

        self._em.send(request)
        results = self._wait_for_results()

        request.perform = jcoms.AnalysisRequest.Perform.Value('RUN')

        self._em.send(request)
        results = self._wait_for_results()

        assert results


if __name__ == '__main__':
    unittest.main()
