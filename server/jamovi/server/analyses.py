
import os.path
import yaml
from enum import Enum
from concurrent.futures import Future

from .modules import Modules
from .options import Options
from . import jamovi_pb2 as jcoms


class Analysis:

    class Status(Enum):
        NONE = 0
        INITED = 1
        RUNNING = 2
        COMPLETE = 3
        ERROR = 4
        DELETED = 5

    class Op:

        SAVE = 1

        def __init__(self, op, parent):
            self.op = op
            self.parent = parent
            self.waiting = True
            self.future = Future()
            self.path = None
            self.part = None

        def set_result(self, result):
            self.parent._ops.remove(self)
            self.future.set_result(result)

        def set_exception(self, exception):
            self.parent._ops.remove(self)
            self.future.set_exception(exception)

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

        self._ops = [ ]

    @property
    def has_results(self):
        return self.results is not None

    def set_options(self, options, changes=[]):
        non_passive_changes = self.options.set(options)
        if not non_passive_changes and len(changes) == 0:
            return
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

    def save(self, path, part):
        op = Analysis.Op(Analysis.Op.SAVE, self)
        op.path = path
        op.part = part
        self._ops.append(op)
        self.parent._notify_options_changed(self)
        return op.future

    @property
    def needs_op(self):
        if self._ops:
            return self._ops[0].waiting
        return False

    @property
    def op(self):
        if self._ops:
            return self._ops[0]
        raise RuntimeError('No op waiting')

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
    def __init__(self, parent, needs_init=False, needs_op=False):
        self._parent = parent
        self._needs_init = needs_init
        self._needs_op = needs_op
        self._iter = parent.__iter__()

    def __iter__(self):
        return self

    def __next__(self):
        if self._needs_op:
            while True:
                analysis = self._iter.__next__()
                if analysis.status is Analysis.Status.COMPLETE and analysis.needs_op:
                    return analysis
        else:
            while True:
                analysis = self._iter.__next__()
                if analysis.status is Analysis.Status.NONE:
                    return analysis
                if self._needs_init is False and analysis.status is Analysis.Status.INITED:
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

    def create(self, id, name, ns, options_pb):

        module = Modules.instance().get(ns)
        analysis_root = os.path.join(module.path, 'analyses', name.lower())

        with open(analysis_root + '.a.yaml', 'r', encoding='utf-8') as stream:
            defn = yaml.load(stream)
            analysis_name = defn['name']
            option_defs = defn['options']

            options = Options.create(option_defs)
            options.set(options_pb)

            analysis = Analysis(id, analysis_name, ns, options, self)
            self._analyses.append(analysis)
            self._notify_options_changed(analysis)

            return analysis

    @property
    def needs_init(self):
        return AnalysisIterator(self, True)

    @property
    def needs_run(self):
        return AnalysisIterator(self, False)

    @property
    def needs_op(self):
        return AnalysisIterator(self, needs_op=True)

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

    def __delitem__(self, id):
        for analysis in self._analyses:
            if analysis.id == id:
                self._analyses.remove(analysis)
                break
        else:
            raise KeyError(id)

    def __iter__(self):
        return self._analyses.__iter__()
