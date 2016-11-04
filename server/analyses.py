
import os.path
import yaml
from enum import Enum

from .options import Options
from . import jamovi_pb2 as jcoms


class Analysis:

    class Status(Enum):
        NONE = 0
        INITED = 1
        RUNNING = 2
        COMPLETE = 3
        ERROR = 4

    def __init__(self, id, name, ns, options, parent):
        self.id = id
        self.name = name
        self.ns = ns
        self.options = options
        self.parent = parent
        self.results = None
        self.revision = 0
        self.changes = set()
        self.status = Analysis.Status.NONE
        self.clear_state = False

    @property
    def has_results(self):
        return self.results is not None

    def set_options(self, options, changes=[]):
        self.options.set(options)
        if len(changes) > 0:
            self.changes |= set(changes)
        self.revision += 1
        self.status = Analysis.Status.NONE
        self.parent._notify_options_changed(self)

    def set_results(self, results):
        self.results = results
        self.changes.clear()
        self.status = Analysis.Status(results.status)
        self.clear_state = False
        self.parent._notify_results_changed(self)

    def rerun(self):
        self.revision += 1
        self.status = Analysis.Status.NONE
        self.clear_state = True
        self.parent._notify_options_changed(self)

    def serialize(self):
        return self.results.SerializeToString()

    @property
    def resources(self):
        return Analysis._get_resources(self.results.results)

    @staticmethod
    def _get_resources(results_pb):
        if results_pb.HasField('image'):
            return [ results_pb.image.path ]
        elif results_pb.HasField('group'):
            resources = [ ]
            for element_pb in results_pb.group.elements:
                resources += Analysis._get_resources(element_pb)
            return resources
        elif results_pb.HasField('array'):
            resources = [ ]
            for element_pb in results_pb.array.elements:
                resources += Analysis._get_resources(element_pb)
            return resources
        return [ ]


class AnalysisIterator:
    def __init__(self, parent, needs_init=False):
        self._parent = parent
        self._needs_init = needs_init
        self._iter = parent.__iter__()

    def __iter__(self):
        return self

    def __next__(self):
        while True:
            analysis = self._iter.__next__()
            if analysis.status is Analysis.Status.NONE:
                return analysis
            elif self._needs_init is False and analysis.status is Analysis.Status.INITED:
                return analysis


class Analyses:
    def __init__(self):
        self._analyses = []
        self._options_changed_listeners = []
        self._results_changed_listeners = []

    def create_from_serial(self, serial):
        analysis_pb = jcoms.AnalysisResponse()
        analysis_pb.ParseFromString(serial)

        options = Options()
        options.read(analysis_pb.options.SerializeToString())

        analysis = Analysis(analysis_pb.analysisId, analysis_pb.name, analysis_pb.ns, options, self)
        analysis.results = analysis_pb
        analysis.status = Analysis.Status.COMPLETE
        self._analyses.append(analysis)

        return analysis

    def create(self, id, name, ns):

        here = os.path.realpath(os.path.dirname(__file__))
        module_root = os.path.join(here, 'resources', 'modules')
        analysis_root = os.path.join(module_root, ns, 'analyses', name.lower())

        with open(analysis_root + '.a.yaml', 'r', encoding='utf-8') as stream:
            defn = yaml.load(stream)
            analysisName = defn['name']
            optionDefs = defn['options']

            options = Options.create(optionDefs)

            analysis = Analysis(id, analysisName, ns, options, self)
            self._analyses.append(analysis)
            self._notify_options_changed(analysis)

            return analysis

    @property
    def need_init(self):
        return AnalysisIterator(self, True)

    @property
    def need_run(self):
        return AnalysisIterator(self, False)

    def add_results_changed_listener(self, listener):
        self._results_changed_listeners.append(listener)

    def remove_results_changed_listener(self, listener):
        self._results_changed_listeners.remove(listener)

    def add_options_changed_listener(self, listener):
        self._options_changed_listeners.append(listener)

    def remove_options_changed_listener(self, listener):
        self._options_changed_listeners.remove(listener)

    def _notify_options_changed(self, analysis):
        for listener in self._options_changed_listeners:
            listener(analysis)

    def _notify_results_changed(self, analysis):
        for listener in self._results_changed_listeners:
            listener(analysis)

    def get(self, id):
        for analysis in self._analyses:
            if analysis.id == id:
                return analysis
        return None

    def __getitem__(self, id):
        analysis = self.get(id)
        if analysis is None:
            raise KeyError(id)
        return analysis

    def __iter__(self):
        return self._analyses.__iter__()
