
import os.path
import json
from enum import Enum
from asyncio import Future
from copy import deepcopy
from collections import namedtuple
from itertools import islice
from logging import getLogger

from .modules import Modules
from .options import Options
from . import jamovi_pb2 as jcoms

from jamovi.core import MeasureType


Output = namedtuple('Output', 'name title description measure_type values levels')
OptionOutputs = namedtuple('OptionOutputs', 'option_name outputs')
AnalysisOutputs = namedtuple('Outputs', 'analysis_id outputs')


log = getLogger(__name__)


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
        self._outputs_synced = { }

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

        for output_name, keys_synced in self._outputs_synced.items():
            synced = list(filter(lambda k: keys_synced[k], keys_synced))
            value = self.options.get_value(output_name, None)
            if value is None:
                value = { }
            value['synced'] = synced
            self.options.set_value(output_name, value)

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

        if complete and not silent:

            analysis_outputs = [ ]

            for element in results.results.group.elements:
                if element.HasField('outputs'):

                    option_outputs = [ ]
                    option_name = element.name

                    if option_name in self._outputs_synced:
                        keys_synced = self._outputs_synced[option_name]
                        keys = map(lambda x: x.name, element.outputs.outputs)
                        keys_synced = { k : keys_synced.get(k, False) for k in keys }
                    else:
                        keys_synced = { }

                    self._outputs_synced[option_name] = keys_synced

                    for output in element.outputs.outputs:

                        n_rows = max(len(output.d), len(output.i))

                        if element.outputs.rowNums:
                            row_nums = element.outputs.rowNums
                            n_rows = row_nums[n_rows - 1] + 1
                            row_nums = islice(row_nums, 0, n_rows)
                        else:
                            row_nums = range(n_rows)

                        values = None
                        levels = None
                        measure_type = MeasureType(output.measureType)

                        if output.incData:

                            keys_synced[output.name] = True

                            if len(output.d) > 0:
                                values = [float('nan')] * n_rows
                                for source_row_no, dest_row_no in enumerate(row_nums):
                                    values[dest_row_no] = output.d[source_row_no]
                                measure_type = MeasureType.CONTINUOUS
                                # clear these, no need to send to client or store
                                output.ClearField('d')
                                output.incData = False
                            elif len(output.i) > 0:
                                levels = output.levels
                                values = [-2147483648] * n_rows
                                for source_row_no, dest_row_no in enumerate(row_nums):
                                    values[dest_row_no] = output.i[source_row_no]
                                # clear these, no need to send to client or store
                                output.ClearField('i')
                                output.incData = False
                            else:
                                values = [ ]
                        else:
                            if output.stale:
                                keys_synced[output.name] = False

                        option_outputs.append(Output(
                            output.name,
                            output.title,
                            output.description,
                            measure_type,
                            values,
                            levels))

                    # clear these, no need to send to client or store
                    element.outputs.ClearField('rowNums')

                    analysis_outputs.append(OptionOutputs(option_name, option_outputs))

            if analysis_outputs:
                outputs = AnalysisOutputs(self.id, analysis_outputs)
                self.parent._notify_output_received(outputs)

        self.changes.clear()
        self.clear_state = False
        if not silent:
            self.parent._notify_results_changed(self)

    def copy_from(self, analysis):
        self.revision = analysis.revision
        self.status = analysis.status
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
        self._output_received_listeners = []
        self._next_id = 1   # server side created analyses always have odd ids

        Modules.instance().add_listener(self._module_event)

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

    def translate_default(self, i18n_map, opt_defn, _default_value=None):
        if _default_value == None:
            if 'default' in opt_defn and opt_defn['default'] is not None:
                translated = self.translate_default(i18n_map, opt_defn, opt_defn['default'])
                if translated != None:
                    opt_defn['default'] = translated
                return None

        if _default_value != None:
            typ  = opt_defn['type']
            if typ == 'String':
                value = _default_value
                if _default_value in i18n_map:
                    value = i18n_map[_default_value][0].strip()
                    if value == '':
                        value = _default_value
                return value
            elif typ == 'Group':
                for element in opt_defn['elements']:
                    translated = self.translate_default(i18n_map, element, _default_value[element['name']])
                    if translated != None:
                        _default_value[element['name']] = translated
            elif typ == 'Array':
                for i, value in enumerate(_default_value):
                    translated = self.translate_default(i18n_map, opt_defn['template'], value)
                    if translated != None:
                        _default_value[i] = translated

        return _default_value;

    def _construct(self, id, name, ns, i18n=None, options_pb=None, enabled=None):

        if name == 'empty' and ns == 'jmv':
            return Analysis(self._dataset, id, name, ns, Options.create({}), self, enabled)

        try:
            module_meta = Modules.instance().get(ns)
            analysis_meta = module_meta.get(name)

            analysis_name = analysis_meta.name
            option_defs = analysis_meta.defn['options']

            if i18n is not None:
                i18n_def = None
                i18n_root = os.path.join(module_meta.path, 'i18n', i18n + '.json')
                with open(i18n_root, 'r', encoding='utf-8') as stream:
                    i18n_def = json.load(stream)
                i18n_map = i18n_def['locale_data']['messages']
                for opt_defn in option_defs:
                    self.translate_default(i18n_map, opt_defn)

            if enabled is None:
                enabled = not analysis_meta.defn.get('arbitraryCode', False)

            options = Options.create(option_defs)
            if options_pb is not None:
                options.set(options_pb)

            addons = list(map(lambda addon: self._construct(id, addon[1], addon[0], i18n), analysis_meta.addons))

            return Analysis(self._dataset, id, analysis_name, ns, options, self, enabled, addons=addons)

        except Exception as e:
            log.exception(e)
            return Analysis(self._dataset, id, name, ns, Options.create({}), self, enabled, load_error=True)

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
            None,
            analysis_pb.options)

        if analysis_pb.dependsOn != 0:
            patron = self.get(analysis_pb.dependsOn)
            if patron is not None:
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

    def create(self, id, name, ns, i18n, options_pb, index=None):

        if id == 0:
            id = self._next_id
            self._next_id += 2
        elif id >= self._next_id:
            if id % 2 != 0:
                self._next_id = id + 2
            else:
                self._next_id = id + 1

        analysis = self._construct(id, name, ns, i18n, options_pb, True)

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
            None,
            options.as_pb())
        annotation.status = Analysis.Status.COMPLETE
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

    def _notify_output_received(self, output):
        for listener in self._output_received_listeners:
            listener(output)

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
