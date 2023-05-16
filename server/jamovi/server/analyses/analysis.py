
from enum import Enum
from collections import namedtuple
from asyncio import Future
from itertools import islice
from copy import deepcopy

from jamovi.core import MeasureType
from jamovi.server import jamovi_pb2 as jcoms

Output = namedtuple('Output', 'name title description measure_type values levels')
OptionOutputs = namedtuple('OptionOutputs', 'option_name outputs')
AnalysisOutputs = namedtuple('Outputs', 'analysis_id outputs')


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

    def __init__(self,
                 dataset,
                 id,
                 name,
                 ns,
                 options,
                 parent,
                 enabled,
                 *,
                 addons=None,
                 load_error=False,
                 arbitrary_code=False):

        self.dataset = dataset
        self.id = id
        self.name = name
        self.ns = ns
        self.options = options
        self.parent = parent
        self.results = None
        self.revision = 0
        self.changes = set()
        self._status = Analysis.Status.NONE
        self.clear_state = False
        self.enabled = enabled
        self.arbitrary_code = arbitrary_code
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
        self._status = Analysis.Status.NONE
        self.parent._notify_options_changed(self)

    @property
    def status(self):
        return self._status

    def set_status(self, status):
        self._status = status

    def set_error(self, message):
        results = jcoms.AnalysisResponse()
        results.analysisId = self.id
        results.name = self.name
        results.ns = self.ns
        results.status = jcoms.AnalysisStatus.Value('ANALYSIS_ERROR')
        results.revision = self.revision
        results.results.name = self.name
        results.results.title = self.name
        results.results.status = jcoms.AnalysisStatus.Value('ANALYSIS_ERROR')
        results.results.error.message = message
        self.set_results(results)

    def set_results(self, results, complete=True, silent=False):

        if results.results.error.message != '':
            use_previous_results = False
            if len(results.results.group.elements) == 0:
                use_previous_results = True
            elif len(results.results.group.elements) == 1:
                # i'm not sure why we have to do this
                first_elem = results.results.group.elements[0]
                if (first_elem.WhichOneof('type') == 'preformatted'
                        and first_elem.preformatted == ''):
                    use_previous_results = True

            if use_previous_results:
                if self.results is None:
                    # the client requires there to be at least one
                    # results element
                    elem = results.results.group.elements.add()
                    elem.preformatted = ''
                    new_results = results
                else:
                    new_results = self.results

                new_results.revision = self.revision
                new_results.results.error.message = results.results.error.message
                self._change_status_to_complete(new_results.results)
                results = new_results
                complete = True

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
                        keys_synced = { k: keys_synced.get(k, False) for k in keys }
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
                self.parent._notify_output_received(self, outputs)

        self.changes.clear()
        self.clear_state = False
        if not silent:
            self.parent._notify_results_changed(self)

    def get_using(self):
        return self.options.get_using()

    def get_producing(self):
        return self.options.get_producing()

    def notify_changes(self, changes, renamed=None):
        if renamed:
            self.options.rename_using(renamed)
        if changes:
            self.changes |= set(changes)
        self.complete = False
        self._status = Analysis.Status.NONE
        if self.enabled:
            self.parent._notify_options_changed(self)

    def copy_from(self, analysis):
        self.revision = analysis.revision
        self._status = analysis.status
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
        self.complete = False
        self._status = Analysis.Status.NONE
        self.parent._notify_options_changed(self)

    def rerun(self):
        self.complete = False
        self._status = Analysis.Status.NONE
        self.clear_state = True
        self.parent._notify_options_changed(self)

    def serialize(self, strip_content=False):
        self.options.compress()
        self.results.options.CopyFrom(self.options.as_pb())
        clone = deepcopy(self.results)
        self._change_status_to_complete(clone.results, strip_content)
        return clone.SerializeToString()

    def _change_status_to_complete(self, pb, strip_content=False):
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

    def notify_removing(self):
        pass


