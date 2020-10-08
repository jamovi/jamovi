
import os.path
import yaml
from enum import Enum
from asyncio import Future
from copy import deepcopy

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
            self.enabled = False

        def set_result(self, result):
            self.parent._ops.remove(self)
            self.future.set_result(result)

        def set_exception(self, exception):
            self.parent._ops.remove(self)
            self.future.set_exception(exception)

    def __init__(self, dataset, id, name, ns, options, parent, enabled, addons=None, load_error=False):
        self.dataset = dataset
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
        self.enabled = enabled
        self.complete = False
        if addons is None:
            addons = [ ]
        self.addons = addons
        self.load_error = load_error
        self.dependents = [ ]
        self.depends_on = 0

        self._ops = [ ]

    @property
    def has_results(self):
        return self.results is not None

    @property
    def instance(self):
        return self.dataset.instance

    def reset_options(self, revision):
        self.revision = revision
        self.options.reset()
        self.results.options.CopyFrom(self.options.as_pb())
        self.results.revision = revision

    def set_options(self, options, changes, revision, enabled=None):
        self.revision = revision
        wasnt_but_now_is_enabled = (self.enabled is False) and enabled
        if enabled:
            self.enabled = True
        non_passive_changes = self.options.set(options)
        if not non_passive_changes and len(changes) == 0 and not wasnt_but_now_is_enabled:
            self.results.options.CopyFrom(self.options.as_pb())
            return
        self.complete = False
        if len(changes) > 0:
            self.changes |= set(changes)
        self.status = Analysis.Status.NONE
        self.parent._notify_options_changed(self)

    def set_results(self, results, complete=True, silent=False):
        self.results = results
        self.complete = complete
        if len(results.options.names) > 0:  # if not empty
            # use options from results
            self.options.set(results.options)
        else:
            # otherwise use options from analysis
            results.options.CopyFrom(self.options.as_pb())

        results.dependsOn = self.depends_on
        results.index = self.parent.index_of(self) + 1

        self.changes.clear()
        self.clear_state = False
        if not silent:
            self.parent._notify_results_changed(self)

    def copy_from(self, analysis):
        self.revision = analysis.revision
        results = deepcopy(analysis.results)

        results.instanceId = self.instance.id
        results.analysisId = self.id
        results.index = 0

        self.set_results(results, silent=True)

    def add_dependent(self, child):
        self.dependents.append(child)
        child.depends_on = self.id
        if child.results:
            child.results.dependsOn = self.id

    def run(self):
        self.status = Analysis.Status.NONE
        self.parent._notify_options_changed(self)

    def rerun(self):
        self.status = Analysis.Status.NONE
        self.clear_state = True
        self.parent._notify_options_changed(self)

    def serialize(self, strip_content=False):
        self.options.compress()
        self.results.options.CopyFrom(self.options.as_pb())
        clone = deepcopy(self.results)
        self._change_status_to_complete(clone.results, strip_content)
        return clone.SerializeToString()

    def _change_status_to_complete(self, pb, strip_content):
        if (pb.status != Analysis.Status.COMPLETE.value
                and pb.status != Analysis.Status.ERROR.value):
            pb.status = Analysis.Status.COMPLETE.value
        if pb.HasField('group'):
            for elem_pb in pb.group.elements:
                self._change_status_to_complete(elem_pb, strip_content)
        elif pb.HasField('array'):
            for elem_pb in pb.array.elements:
                self._change_status_to_complete(elem_pb, strip_content)
        elif strip_content:
            pb.stale = True
            if pb.HasField('table'):
                for column_pb in pb.table.columns:
                    for cell_pb in column_pb.cells:
                        cell_pb.o = 0
                        del cell_pb.footnotes[:]
                        del cell_pb.symbols[:]
                del pb.table.notes[:]
            elif pb.HasField('image'):
                pb.image.path = ''

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
            path = results_pb.image.path
            if path != '':
                return [ path ]
            else:
                return [ ]
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
                if analysis.ns == 'jmv' and analysis.name == 'empty':
                    continue
                if analysis.status is Analysis.Status.NONE:
                    return analysis
                if not analysis.enabled:
                    continue
                if self._needs_init is False and analysis.status is Analysis.Status.INITED:
                    return analysis


class Analyses:
    def __init__(self, dataset):
        self._dataset = dataset
        self._analyses = []
        self._options_changed_listeners = []
        self._results_changed_listeners = []
        self._next_id = 1

        Modules.instance().add_listener(self._module_event)

    def _module_event(self, event):
        if event['type'] == 'moduleInstalled':
            module_name = event['data']['name']
            ids = [ ]
            for analysis in self._analyses:
                if analysis.ns == module_name:
                    ids.append(analysis.id)

            for id in ids:
                self.recreate(id).rerun()

    def _construct(self, id, name, ns, options_pb=None, enabled=None):

        try:
            module_desc = Modules.instance().get(ns)
            analysis_desc = module_desc.get(name)

            analysis_root = os.path.join(module_desc.path, 'analyses', name.lower())

            a_defn = None
            r_defn = None

            with open(analysis_root + '.a.yaml', 'r', encoding='utf-8') as stream:
                a_defn = yaml.safe_load(stream)

            if os.path.isfile(analysis_root + '.r.yaml'):
                with open(analysis_root + '.r.yaml', 'r', encoding='utf-8') as stream:
                    r_defn = yaml.safe_load(stream)
            else:
                r_defn = { 'items': { } }

            analysis_name = a_defn['name']
            option_defs = a_defn['options']
            results_defs = r_defn['items']

            if enabled is None:
                enabled = not a_defn.get('arbitraryCode', False)

            options = Options.create(option_defs, results_defs)
            if options_pb is not None:
                options.set(options_pb)

            addons = list(map(lambda addon: self._construct(id, addon[1], addon[0]), analysis_desc.addons))

            return Analysis(self._dataset, id, analysis_name, ns, options, self, enabled, addons=addons)

        except Exception:
            return Analysis(self._dataset, id, name, ns, Options(), self, enabled, load_error=True)

    def _construct_from_pb(self, analysis_pb, new_id=False, status=Analysis.Status.NONE):
        for ref_pb in analysis_pb.references:
            # Handle corrupt references
            if not ref_pb.HasField('authors'):
                del analysis_pb.references[:]
                break

        id = analysis_pb.analysisId
        if new_id:
            id = self._next_id
            self._next_id += 1

        if id >= self._next_id:
            self._next_id = id + 1

        analysis = self._construct(
            id,
            analysis_pb.name,
            analysis_pb.ns,
            analysis_pb.options)

        if analysis_pb.dependsOn != 0:
            patron = self.get(analysis_pb.dependsOn)
            patron.add_dependent(analysis)

        analysis.set_results(analysis_pb, silent=True)
        analysis.status = status

        return analysis

    def create_from_serial(self, serial):

        analysis_pb = jcoms.AnalysisResponse()
        analysis_pb.ParseFromString(serial)

        analysis = self._construct_from_pb(analysis_pb, status=Analysis.Status.COMPLETE)

        self._analyses.append(analysis)

        return analysis

    def has_header_annotation(self):
        if len(self._analyses) == 0:
            return False

        return self._analyses[0].name == 'empty'

    def create(self, id, name, ns, options_pb, index=None):

        if id == 0:
            id = self._next_id
            self._next_id += 1
        elif id >= self._next_id:
            self._next_id = id + 1

        analysis = self._construct(id, name, ns, options_pb, True)

        if index is not None:
            self._analyses.insert(index, analysis)
        else:
            self._analyses.append(analysis)
            index = len(self._analyses) - 1

        annotation = self.create_annotation(index + 1, update_indices=False)

        self.update_indices()

        analysis.add_dependent(annotation)

        return analysis

    def create_annotation(self, index, update_indices=True):
        options = Options.create([], [])
        annotation = self._construct(
            self._next_id,
            'empty',
            'jmv',
            options.as_pb())
        annotation.status = Analysis.Status.COMPLETE
        self._next_id += 1

        annotation_pb = jcoms.AnalysisResponse()
        annotation_pb.name = annotation.name
        annotation_pb.ns = annotation.ns
        annotation_pb.analysisId = annotation.id
        annotation_pb.options.ParseFromString(annotation.options.as_bytes())
        annotation_pb.status = jcoms.AnalysisStatus.Value('ANALYSIS_COMPLETE')
        annotation_pb.index = index + 1
        annotation_pb.title = ''
        annotation_pb.hasTitle = True
        annotation_pb.results.title = 'Results'
        annotation_pb.results.group.CopyFrom(jcoms.ResultsGroup())
        annotation_pb.results.status = jcoms.AnalysisStatus.Value('ANALYSIS_COMPLETE')

        annotation.set_results(annotation_pb, silent=True)

        if index is not None:
            self._analyses.insert(index, annotation)
        else:
            self._analyses.append(annotation)

        if update_indices:
            self.update_indices()

        return annotation

    def update_indices(self):
        for i in range(0, len(self._analyses)):
            if self._analyses[i].results is not None:
                self._analyses[i].results.index = i + 1

    def index_of(self, analysis):
        try:
            return self._analyses.index(analysis)
        except Exception:
            return -1

    def recreate(self, id):
        old = self[id]
        index = self._analyses.index(old)
        del self[id]
        analysis = self.create(id, old.name, old.ns, old.options.as_pb(), index)
        analysis.revision = old.revision
        return analysis

    def rerun(self):
        for analysis in self:
            analysis.rerun()

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

    def remove_all(self):
        self._analyses = []

    def _notify_options_changed(self, analysis):
        for listener in self._options_changed_listeners:
            listener(analysis)

    def _notify_results_changed(self, analysis):
        for listener in self._results_changed_listeners:
            listener(analysis)

    def get(self, id, instance_id=None):
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
