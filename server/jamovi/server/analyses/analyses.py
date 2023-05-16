
from jamovi.server import i18n
from jamovi.server.i18n import _
from jamovi.server import jamovi_pb2 as jcoms

from jamovi.server.options import Options
from jamovi.server.utils.event import EventHook

from .analysis import Analysis
from .weights import Weights
from .iterator import AnalysisIterator

from logging import getLogger

log = getLogger(__name__)


class Analyses:

    weights_changed: EventHook

    def __init__(self, dataset, modules):
        self._dataset = dataset
        self._modules = modules
        self._modules.add_listener(self._module_event)

        self._analyses = []
        self._options_changed_listeners = []
        self._results_changed_listeners = []
        self._output_received_listeners = []
        self._next_id = 1   # server side created analyses always have odd ids

        self.weights_changed = EventHook()

    def count(self):
        return len(self._analyses)

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

        if name == 'empty' and ns == 'jmv':
            return Analysis(self._dataset, id, name, ns, Options.create({}), self, enabled=False)

        if name == 'weights' and ns == 'jmv':
            return Weights(self._dataset, id, name, ns, Options.create({}), self, enabled=False)

        try:
            module_meta = self._modules.get(ns)
            analysis_meta = module_meta.get(name)

            analysis_name = analysis_meta.name
            option_defs = analysis_meta.defn['options']

            analysis_meta.translate_defaults(module_meta, i18n.get_language())

            arbitrary_code = (analysis_meta.defn.get('arbitraryCode', False)
                              or analysis_meta.defn.get('arbitraryCode2', False))

            if enabled is None:
                enabled = not arbitrary_code

            options = Options.create(option_defs)
            if options_pb is not None:
                options.set(options_pb)

            addons = list(map(lambda addon: self._construct(id, addon[1], addon[0]), analysis_meta.addons))

            if name == 'weights' and ns == 'jmv':
                Ctor = Weights
            else:
                Ctor = Analysis

            return Ctor(self._dataset, id, analysis_name, ns, options, self,
                        enabled, addons=addons, arbitrary_code=arbitrary_code)

        except Exception as e:
            log.exception(e)
            return Analysis(self._dataset, id, name, ns, Options.create({}), self, enabled=False, load_error=True)

    def _construct_from_pb(self, analysis_pb, new_id=False, status=Analysis.Status.NONE):
        for ref_pb in analysis_pb.references:
            # Handle corrupt references
            if not ref_pb.HasField('authors'):
                del analysis_pb.references[:]
                break

        id = analysis_pb.analysisId
        if new_id:
            id = self._next_id
            self._next_id += 2

        if id >= self._next_id:
            if id % 2 != 0:
                self._next_id = id + 2
            else:
                self._next_id = id + 1

        analysis = self._construct(
            id,
            analysis_pb.name,
            analysis_pb.ns,
            analysis_pb.options,
            None)

        if analysis_pb.dependsOn != 0:
            patron = self.get(analysis_pb.dependsOn)
            if patron is not None:
                patron.add_dependent(analysis)

        analysis.set_results(analysis_pb, silent=True)
        analysis.set_status(status)

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

    def create(self, id, name, ns, options_pb=None, index=None):

        if id == 0:
            id = self._next_id
            self._next_id += 2
        elif id >= self._next_id:
            if id % 2 != 0:
                self._next_id = id + 2
            else:
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
        options = Options.create({})
        annotation = self._construct(
            self._next_id,
            'empty',
            'jmv',
            options.as_pb())
        annotation.set_status(Analysis.Status.COMPLETE)
        self._next_id += 2

        annotation_pb = jcoms.AnalysisResponse()
        annotation_pb.name = annotation.name
        annotation_pb.ns = annotation.ns
        annotation_pb.analysisId = annotation.id
        annotation_pb.options.ParseFromString(annotation.options.as_bytes())
        annotation_pb.status = jcoms.AnalysisStatus.Value('ANALYSIS_COMPLETE')
        annotation_pb.index = index + 1
        annotation_pb.title = ''
        annotation_pb.hasTitle = True
        annotation_pb.results.title = _('Results')
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
            if analysis.enabled:
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

    def add_output_received_listener(self, listener):
        self._output_received_listeners.append(listener)

    def remove_output_received_listener(self, listener):
        self._output_received_listeners.remove(listener)

    def remove_all(self):
        self._analyses = []

    def _notify_options_changed(self, analysis):
        for listener in self._options_changed_listeners:
            listener(analysis)

    def _notify_results_changed(self, analysis):
        for listener in self._results_changed_listeners:
            listener(analysis)

    def _notify_output_received(self, analysis, output):
        for listener in self._output_received_listeners:
            listener(analysis, output)

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
                analysis.notify_removing()
                self._analyses.remove(analysis)
                break
        else:
            raise KeyError(id)

    def __iter__(self):
        return self._analyses.__iter__()
