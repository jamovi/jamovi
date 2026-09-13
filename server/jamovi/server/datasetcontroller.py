#
# Copyright (C) 2016 Jonathon Love
#

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType

from . import jamovi_pb2 as jcoms

from .utils import CSVParser
from .utils import HTMLParser
from .modtracker import ModTracker

import re
import math
import logging
from itertools import islice

from .utils import is_int32
from .utils import describe_datasetrr
from .i18n import _


EURO_REGEX = re.compile(r'^\d+,\d+$')


log = logging.getLogger(__name__)


class ForbiddenOp(PermissionError):
    def __init__(self, operation, message):
        super().__init__(message)
        self.operation = operation


class DataSetController:
    """Handles DataSetRR requests against a single DataSetModel.

    One controller exists per data set in a project. It owns the data set's
    ModTracker (undo/redo). It does not send anything to the client itself;
    handle() returns the response, and the Instance sends it.
    """

    def __init__(self, instance, data):
        self._instance = instance
        self._data = data
        self._mod_tracker = ModTracker(data)
        self._perms = instance._perms
        self._settings = instance._settings

    @property
    def dataset(self):
        return self._data

    @property
    def mod_tracker(self):
        return self._mod_tracker

    def _clone_cell_selections(self, from_msg, to_msg):
        del to_msg.data[:]

        to_msg.incData = from_msg.incData
        if from_msg.incData:
            for block in from_msg.data:
                n_block = to_msg.data.add()
                n_block.rowStart = block.rowStart
                n_block.columnStart = block.columnStart
                n_block.rowCount = block.rowCount
                n_block.columnCount = block.columnCount

    async def handle(self, request):
        """Perform a DataSetRR request and return the response.

        Raises ForbiddenOp (or other exceptions) on failure; the caller is
        responsible for reporting these to the client.
        """

        response = jcoms.DataSetRR()

        if request.op == jcoms.GetSet.Value('SET'):
            async with self._data.attach():
                response.op = request.op
                self._clone_cell_selections(request, response)
                if request.noUndo is False:
                    self._mod_tracker.begin_event(request)
                self._on_dataset_set(request, response)
                if request.noUndo is False:
                    self._mod_tracker.end_event()
        elif request.op == jcoms.GetSet.Value('GET'):
            async with self._data.attach(read_only=True):
                response.op = request.op
                self._clone_cell_selections(request, response)
                self._on_dataset_get(request, response)
        elif request.op == jcoms.GetSet.Value('UNDO'):
            async with self._data.attach():
                log.debug('Undo')
                undo_request = self._mod_tracker.begin_undo()
                response.op = undo_request.op
                self._clone_cell_selections(undo_request, response)
                self._on_dataset_set(undo_request, response)
                self._mod_tracker.end_undo(response)
                log.debug('Undo complete')
        elif request.op == jcoms.GetSet.Value('REDO'):
            async with self._data.attach():
                log.debug('Redo')
                redo_request = self._mod_tracker.get_redo()
                response.op = redo_request.op
                self._clone_cell_selections(redo_request, response)
                self._on_dataset_set(redo_request, response)
                log.debug('Redo complete')
        else:
            raise ValueError()

        response.changesCount = self._mod_tracker.count
        response.changesPosition = self._mod_tracker.position

        return response

    def _on_dataset_set_checks(self, request):

        n_columns = self._data.column_count
        n_rows = self._data.row_count

        for column_pb in request.schema.columns:
            if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('INSERT'):
                n_columns += 1

        for row_pb in request.rows:
            if row_pb.action == jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT'):
                n_rows += row_pb.rowCount

        # also check when the user enters values outside the data set
        for block_pb in request.data:
            n_columns = max(n_columns, block_pb.columnStart + block_pb.columnCount)
            n_rows = max(n_rows, block_pb.rowStart + block_pb.rowCount)

        if n_columns > self._perms.dataset.maxColumns:
            raise ForbiddenOp(
                _('Could not insert columns'),
                _('This session is limited to {} columns').format(
                    self._perms.dataset.maxColumns))

        if n_rows > self._perms.dataset.maxRows:
            raise ForbiddenOp(
                _('Could not insert rows'),
                _('This session is limited to {} rows').format(
                    self._perms.dataset.maxRows))

    def _on_dataset_set(self, request, response):

        # we have to perform checks before we start making changes, as
        # we don't want to abort part way through, leaving things in an
        # indeterminate state
        self._on_dataset_set_checks(request)

        changes = {
            'columns': set(),
            'data_changed': set(),
            'transforms': set(),
            'deleted_columns': set(),
            'deleted_transforms': set(),
            'filters_changed': False,
            'columns_renamed': { },
            'rows_added_removed': False,
        }

        desc = describe_datasetrr(request)
        log.debug('DataSet change: %s', desc)
        log.debug('Request: %s', request.SerializeToString())

        try:
            self._on_dataset_del_cols(request, response, changes)
            self._on_dataset_del_rows(request, response, changes)
            self._on_dataset_ins_cols(request, response, changes)
            self._on_dataset_ins_rows(request, response, changes)
            self._on_dataset_mod_cols(request, response, changes)
            if request.incData:
                self._apply_cells(request, response, changes)
        finally:
            log.debug('DataSet changes complete')

        if changes['filters_changed']:
            response.filtersChanged = True
            self._data.refresh_filter_state()

        self.populate_schema_info(request, response)
        # constuct response column schemas
        if len(changes['columns']) > 0 or len(changes['transforms']) > 0 or len(changes['deleted_columns']) > 0 or len(changes['deleted_transforms']) > 0:
            changes['columns'] = changes['columns'].difference(changes['deleted_columns'])
            changes['transforms'] = changes['transforms'].difference(changes['deleted_transforms'])
            changes['columns'] = sorted(changes['columns'], key=lambda x: x.index)
            for column in changes['deleted_columns']:
                column_pb = response.schema.columns.add()
                column_pb.id = column.id
                column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')
            for transform in changes['deleted_transforms']:
                transform_pb = response.schema.transforms.add()
                transform_pb.id = transform.id
                transform_pb.action = jcoms.DataSetSchema.TransformSchema.Action.Value('REMOVE')
            for column in changes['columns']:
                column_schema = response.schema.columns.add()
                data_changed = column in changes['data_changed']
                self.populate_column_schema(column, column_schema, data_changed)
            for transform in changes['transforms']:
                transform_schema = response.schema.transforms.add()
                self._populate_transform_schema(transform, transform_schema)

        renamed = changes['columns_renamed']
        changed = set()
        changed |= set(map(lambda x: x.name, changes['columns']))
        changed |= set(map(lambda x: x.name, changes['deleted_columns']))
        changed |= set(map(lambda x: x.name, changes['data_changed']))

        weights_changed = self._data.has_weights and self._data.weights_name in changed

        self._instance.update_analyses(
            self._data,
            changed=changed,
            renamed=renamed,
            rows_added_removed=changes['rows_added_removed'],
            filters_changed=changes['filters_changed'],
            weights_changed=weights_changed)

    def _on_dataset_get(self, request, response):
        if request.incSchema:
            self._populate_schema(request, response)
        if request.incData:
            self._populate_cells(request, response)

    def _on_dataset_ins_rows(self, request, response, changes):

        insertions = []
        for row_data in request.rows:
            if row_data.action == jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT'):
                insertions.append(row_data)

        if insertions:
            if self._data.ex_filtered and self._data.has_filters:
                raise ForbiddenOp(
                    _('Could not insert rows'),
                    _('You cannot insert rows while filtered rows are hidden'))

        insert_offsets = [0] * len(insertions)
        for i, row_data in enumerate(insertions):
            self._data.insert_rows(row_data.rowStart + insert_offsets[i], row_data.rowCount)
            for j in range(len(insertions)):
                if j != i and (insertions[j].rowStart + insert_offsets[j]) >= (row_data.rowStart + insert_offsets[i]):
                    insert_offsets[j] += row_data.rowCount

        for i, row_data in enumerate(insertions):
            row_data_pb = response.rows.add()
            row_data_pb.rowStart = row_data.rowStart + insert_offsets[i]
            row_data_pb.rowCount = row_data.rowCount
            row_data_pb.action = row_data.action
            self._mod_tracker.log_row_insertion(row_data_pb)

        if len(insertions) > 0:
            changes['rows_added_removed'] = True
            # this is done so that the cell changes are sent back
            for column in self._data:
                changes['columns'].add(column)
                changes['data_changed'].add(column)

    def _on_dataset_ins_cols(self, request, response, changes):

        filter_inserted = False
        to_calc = set()

        request_schema_columns = []
        for column_pb in request.schema.columns:
            if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('INSERT'):
                request_schema_columns.append(column_pb)

        insert_offsets = [0] * len(request_schema_columns)
        for i in range(0, len(request_schema_columns)):
            column_pb = request_schema_columns[i]

            has_name = column_pb.name != ''
            self._data.insert_column(column_pb.index + insert_offsets[i], None, None, column_pb.id)

            column = self._data[column_pb.index + insert_offsets[i]]
            self._mod_tracker.log_column_insertion(column, column_pb)

            for j in range(0, len(request_schema_columns)):
                if j != i and (request_schema_columns[j].index + insert_offsets[j]) >= (column_pb.index + insert_offsets[i]):
                    insert_offsets[j] += 1

            column.column_type = ColumnType(column_pb.columnType)

            if column.column_type is ColumnType.FILTER:
                column.width = 78

            column.change(
                data_type=DataType(column_pb.dataType),
                measure_type=MeasureType(column_pb.measureType))

            column.formula = column_pb.formula
            column.auto_measure = column_pb.autoMeasure
            column.hidden = column_pb.hidden
            column.active = column_pb.active
            column.filter_no = column_pb.filterNo
            column.trim_levels = column_pb.trimLevels
            column.transform = column_pb.transform
            column.parent_id = column_pb.parentId
            column.set_missing_values(list(column_pb.missingValues))

            name = column_pb.name
            if has_name is False and column.column_type == ColumnType.RECODED:
                name = 'T' + str(self._data.get_column_count_by_type(ColumnType.RECODED))
                self._data.set_column_name(column, name)
                name = self._calc_column_name(column, '', '')

            if name != '':
                self._data.set_column_name(column, name)

            if column.column_type is ColumnType.FILTER:
                filter_inserted = True
                to_calc.add(column)

            if column.column_type is ColumnType.COMPUTED or column.column_type is ColumnType.RECODED:
                to_calc.add(column)

        if filter_inserted:
            self._data.update_filter_names()

        # see if we can clear errors in other transforms
        # as a result of the new column(s)
        for trans in self._data.transforms:
            if trans.in_error:  # broken
                trans.parse_formula()
                if not trans.in_error:  # fixed
                    to_calc.update(trans.dependents)
                    changes['transforms'].add(trans)

        # see if we can clear errors in other columns
        for column in self._data:
            message = column.formula_message
            if message != '':
                column.set_needs_parse()
                column.parse_formula()
                if column.formula_message != message:
                    changes['columns'].add(column)

        for column in to_calc:
            column.set_needs_parse()
        for column in to_calc:
            column.parse_formula()
        for column in to_calc:
            column.set_needs_recalc()
        for column in to_calc:
            column.recalc()

        if filter_inserted:
            # we could do this, but a newly inserted filter is all 'true'
            # self._data.refresh_filter_state()
            # so i don't think we need to
            pass

        # has to be after the filter names are renamed
        for i in range(0, len(request_schema_columns)):
            col_pb = request_schema_columns[i]
            column = self._data[col_pb.index + insert_offsets[i]]
            changes['columns'].add(column)

        if filter_inserted:
            for column in self._data:  # the filters info needs sending back because the names may have changed.
                if column.column_type is ColumnType.FILTER:
                    changes['columns'].add(column)

    def _on_dataset_del_rows(self, request, response, changes):
        rows_removed = False
        sorted_data = sorted(request.rows, key=lambda row_data: row_data.rowStart + row_data.rowCount - 1, reverse=True)

        for row_data in sorted_data:

            if self._data.ex_filtered and self._data.has_filters:
                raise ForbiddenOp(
                    _('Could not delete rows'),
                    _('You cannot delete rows while filtered rows are hidden'))

            if row_data.action == jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE'):
                self._mod_tracker.log_row_deletion(row_data)
                row_start = row_data.rowStart
                row_end = row_data.rowStart + row_data.rowCount - 1
                if row_start >= self._data.row_count:
                    continue
                elif row_end >= self._data.row_count:
                    row_end = self._data.row_count - 1

                row_data_pb = response.rows.add()
                row_data_pb.rowStart = row_start
                row_data_pb.rowCount = row_end - row_start + 1
                row_data_pb.action = jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE')

                self._data.delete_rows(row_start, row_end)
                rows_removed = True

        if rows_removed:
            changes['rows_added_removed'] = True
            for column in self._data:  # the column info needs sending back because the cell edit ranges have changed
                changes['columns'].add(column)
                changes['data_changed'].add(column)

    def _on_dataset_del_cols(self, request, response, changes):

        request_schema_columns = []
        for column in request.schema.columns:
            if column.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE'):
                request_schema_columns.append(column)
        request_schema_columns = sorted(request_schema_columns, key=lambda x: x.index, reverse=True)

        to_delete = [None] * (len(request_schema_columns))
        deleted_column_ids = [None] * (len(request_schema_columns))
        to_reparse = set()
        tf_reparse = set()

        filter_deleted = False

        for i in range(len(to_delete)):
            column = None
            if request_schema_columns[i].id == 0:
                column = self._data[request_schema_columns[i].index]
            else:
                column = self._data.get_column_by_id(request_schema_columns[i].id)

            self._mod_tracker.log_column_deletion(column)

            dependents = column.dependents
            to_reparse.update(dependents)

            column.prep_for_deletion()
            to_delete[i] = column
            deleted_column_ids[i] = column.id
            if column.column_type is ColumnType.FILTER:
                filter_deleted = True

            for child in self._data:
                if child.parent_id == column.id:
                    parent_name = ''
                    if child.parent_id > 0:
                        parent = self._data.get_column_by_id(child.parent_id)
                        parent_name = parent.name
                    transform_name = ''
                    if child.transform > 0:
                        transform = self._data.get_transform_by_id(child.transform)
                        transform_name = transform.get_suffix()
                    child.parent_id = 0
                    to_reparse.add(child)
                    new_column_name = self._calc_column_name(child, parent_name, transform_name)
                    self._apply_column_name(child, new_column_name, None, to_reparse)

            for transform in self._data.transforms:
                if column in transform.dependencies:
                    tf_reparse.add(transform)
                    to_reparse.update(transform.dependents)

        to_reparse -= set(to_delete)

        self._data.delete_columns_by_id(deleted_column_ids)

        for transform in tf_reparse:
            transform.parse_formula()

        for column in to_reparse:
            column.set_needs_parse()
        for column in to_reparse:
            column.parse_formula()

        if filter_deleted:
            to_recalc = self._data  # all
        else:
            to_recalc = to_reparse

        for column in to_recalc:
            column.set_needs_recalc()
        for column in to_recalc:
            column.recalc()

        for column in to_delete:
            changes['deleted_columns'].add(column)

        if filter_deleted:
            # filter names could have changed
            for column in self._data:
                if column.is_filter:
                    changes['columns'].add(column)
            changes['filters_changed'] = True
        else:
            for column in sorted(to_reparse, key=lambda x: x.index):
                changes['columns'].add(column)

        for transform in tf_reparse:
            changes['transforms'].add(transform)

    def _calc_column_name(self, column, old_parent_name, old_transform_name):

        pass_test = False

        is_none = old_parent_name == '' and old_transform_name == ''

        current_column_name = column.name
        match = re.match(r'(^.+)(?=( \(\d+\))$)|(^.+)', current_column_name)
        if match:
            current_column_name = match.group(0)

        if is_none:
            match = re.match(r'^T(\d+$)', current_column_name)
            if match:
                pass_test = True
        else:
            test_name = ''
            if '...' not in old_transform_name:
                joiner = ''
                if old_transform_name.startswith('_') is False and old_transform_name.startswith('-') is False:
                    joiner = ' - '
                if old_transform_name == '':
                    test_name = old_parent_name
                elif old_parent_name == '':
                    test_name = '?' + joiner + old_transform_name
                else:
                    test_name = old_parent_name + joiner + old_transform_name
            else:
                insert = old_parent_name
                if insert == '':
                    insert = '?'
                test_name = old_transform_name.replace('...', insert, 1)
            pass_test = current_column_name == test_name.strip()

        if pass_test:
            transform_name = ''
            if column.transform > 0:
                transform = self._data.get_transform_by_id(column.transform)
                transform_name = transform.get_suffix()

            parent_name = ''
            if column.parent_id > 0:
                parent = self._data.get_column_by_id(column.parent_id)
                parent_name = parent.name

            new_name = ''
            if column.transform == 0 and column.parent_id == 0:
                new_name = 'T' + str(self._data.get_column_count_by_type(ColumnType.RECODED))
            elif '...' not in transform_name:
                joiner = ''
                if transform_name.startswith('_') is False and transform_name.startswith('-') is False:
                    joiner = ' - '
                if column.transform == 0:
                    new_name = parent_name
                elif column.parent_id == 0:
                    new_name = '?' + joiner + transform_name
                else:
                    new_name = parent_name + joiner + transform_name
            else:
                insert = parent_name
                if insert == '':
                    insert = '?'
                new_name = transform_name.replace('...', insert, 1)
            return new_name.strip()

        return column.name

    def _apply_column_name(self, column, new_column_name, cols_changed, reparse):
        if new_column_name != column.name:
            is_circular = self._data.has_circular_parenthood(column)

            old_name = column.name
            self._data.set_column_name(column, new_column_name)

            if cols_changed is not None:
                cols_changed.add(column)
            reparse.update(column.dependents)

            if is_circular is False:
                for check_column in self._data:
                    if check_column.parent_id == column.id:
                        transform_name = ''
                        if check_column.transform > 0:
                            transform = self._data.get_transform_by_id(check_column.transform)
                            transform_name = transform.get_suffix()
                        next_column_name = self._calc_column_name(check_column, old_name, transform_name)
                        self._apply_column_name(check_column, next_column_name, cols_changed, reparse)

    def _on_dataset_mod_cols(self, request, response, changes):

        if self._data.ex_filtered and self._data.has_filters:
            # some operations are forbidden when filtered rows are hidden/excluded
            for trans_pb in request.schema.transforms:
                if (trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('UPDATE')
                        or trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('REMOVE')):
                    transform = self._data.get_transform_by_id(trans_pb.id)
                    if any(dep.is_filter for dep in transform.dependents):
                        raise ForbiddenOp(
                            _('Could not modify transform'),
                            _('You cannot modify transforms that affect filters when filtered rows are hidden'))

            for column_pb in request.schema.columns:
                if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('MODIFY'):
                    if column_pb.id != 0:
                        column = self._data.get_column_by_id(column_pb.id)
                        if not column.is_filter and any(dep.is_filter for dep in column.dependents):
                            raise ForbiddenOp(
                                _('Could not modify columns'),
                                _('You cannot modify columns that affect filters when filtered rows are hidden'))

        # columns that need to be reparsed, and/or recalced
        reparse = set()
        recalc = set()

        # the changes to be sent back to the client in the response
        cols_changed = set()
        trans_changed = set()

        for trans_pb in request.schema.transforms:

            trans_id = trans_pb.id
            trans_name = trans_pb.name
            trans_colour_index = trans_pb.colourIndex

            if trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('CREATE'):
                transform = self._data.append_transform(trans_name, trans_id, trans_colour_index)

                transform.formula = list(trans_pb.formula)
                transform.description = trans_pb.description
                transform.suffix = trans_pb.suffix
                transform.measure_type = MeasureType(trans_pb.measureType)

                trans_changed.add(transform)

            elif trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('UPDATE'):
                transform = self._data.get_transform_by_id(trans_id)
                old_transform_name = transform.get_suffix()
                transform_name_changed = self._data.set_transform_name(transform, trans_name)
                self._data.set_transform_colour_index(transform, trans_colour_index)

                transform_name_changed = transform_name_changed or transform.suffix != trans_pb.suffix
                transform.suffix = trans_pb.suffix

                new_formula = list(trans_pb.formula)
                new_m_type = MeasureType(trans_pb.measureType)
                if transform.formula != new_formula or transform.measure_type != new_m_type:
                    transform.formula = new_formula
                    transform.measure_type = new_m_type
                    transform.parse_formula()
                    for column in self._data:
                        if column.transform == trans_id:
                            reparse.add(column)
                elif transform_name_changed:
                    for column in self._data:
                        if column.transform == trans_id:
                            parent_name = ''
                            if column.parent_id > 0:
                                parent = self._data.get_column_by_id(column.parent_id)
                                parent_name = parent.name
                            new_column_name = self._calc_column_name(column, parent_name, old_transform_name)
                            old_name = column.name
                            self._apply_column_name(column, new_column_name, cols_changed, reparse)
                            if old_name != column.name:
                                changes['columns_renamed'][old_name] = column.name

                transform.description = trans_pb.description
                transform.colour_index = trans_pb.colourIndex
                trans_changed.add(transform)
            else:
                pass  # deletion handled further down

        virtualise_column = None
        request_schema_columns = []

        if request.incSchema and request.schema.filtersVisible != self._data.filters_visible:
            self._mod_tracker.log_filters_visible_change(self._data.filters_visible)
            self._data.filters_visible = request.schema.filtersVisible
            for column in self._data:
                if column.is_filter is False:
                    break
                column.hidden = self._data.filters_visible is False
                cols_changed.add(column)

        for column_pb in request.schema.columns:
            if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('MODIFY'):
                column = None
                if column_pb.id != 0:
                    column = self._data.get_column_by_id(column_pb.id)
                else:
                    column = self[column_pb.index]

                self._mod_tracker.log_column_modification(column, column_pb)
                if ColumnType(column_pb.columnType) == ColumnType.NONE:
                    if virtualise_column is None or column.index < virtualise_column.index:
                        virtualise_column = column
                    cols_changed.add(column)
                else:
                    request_schema_columns.append(column_pb)

        if virtualise_column is not None:
            deleted_columns = self._data._virtualise_column(virtualise_column)  # this will virtualise everything to the right of this column
            changes['deleted_columns'].update(deleted_columns)

        if len(request_schema_columns) > 0:

            min_index = self._data.total_column_count
            for column_schema in request_schema_columns:
                column = None
                if column_schema.id == 0:
                    column = self._data[column_schema.index]
                else:
                    column = self._data.get_column_by_id(column_schema.id)

                if column.index < min_index:
                    min_index = column.index

            n_cols_before = self._data.total_column_count

            # 'realise' any virtual columns to the left of the edit
            for i in range(self._data.column_count, min_index):
                column = self._data[i]
                column.realise()
                self._mod_tracker.log_column_realisation(column)
                cols_changed.add(column)

            for column_pb in request_schema_columns:
                column = None
                if column_pb.id == 0:
                    column = self._data[column_pb.index]
                else:
                    column = self._data.get_column_by_id(column_pb.id)
                old_name = column.name
                old_type = column.column_type
                old_d_type = column.data_type
                old_m_type = column.measure_type
                old_formula = column.formula
                old_active = column.active
                old_type = column.column_type
                old_filter_no = column.filter_no
                old_levels = column.levels
                old_trim = column.trim_levels
                old_transform = column.transform
                old_parent_id = column.parent_id
                old_missing_values = column.missing_values

                levels = None
                if column_pb.hasLevels:
                    levels = [ ]
                    for level in column_pb.levels:
                        levels.append((
                            level.value,
                            level.label,
                            level.importValue,
                            level.pinned))

                if column.column_type is ColumnType.NONE:
                    column.column_type = ColumnType(column_pb.columnType)

                if column.column_type is ColumnType.DATA:
                    column.change(
                        data_type=DataType(column_pb.dataType),
                        measure_type=MeasureType(column_pb.measureType),
                        levels=levels)

                column.set_missing_values(list(column_pb.missingValues))
                column.column_type = ColumnType(column_pb.columnType)

                column.formula = column_pb.formula
                column.auto_measure = column_pb.autoMeasure
                column.hidden = column_pb.hidden
                column.active = column_pb.active
                column.filter_no = column_pb.filterNo
                column.trim_levels = column_pb.trimLevels
                column.description = column_pb.description
                column.transform = column_pb.transform
                column.parent_id = column_pb.parentId
                column.width = column_pb.width

                if old_type == ColumnType.NONE and column.column_type == ColumnType.RECODED:
                    new_column_name = 'T' + str(self._data.get_column_count_by_type(ColumnType.RECODED))
                    self._apply_column_name(column, new_column_name, cols_changed, reparse)
                elif column_pb.name != '':
                    new_column_name = column_pb.name
                    if column_pb.transform != old_transform or column_pb.parentId != old_parent_id:
                        transform_name = ''
                        if old_transform > 0:
                            transform = self._data.get_transform_by_id(old_transform)
                            transform_name = transform.get_suffix()
                        parent_name = ''
                        if old_parent_id > 0:
                            parent = self._data.get_column_by_id(old_parent_id)
                            parent_name = parent.name

                        new_column_name = self._calc_column_name(column, parent_name, transform_name)
                    self._apply_column_name(column, new_column_name, cols_changed, reparse)

                cols_changed.add(column)
                if old_name != column.name:
                    changes['columns_renamed'][old_name] = column.name

                # if these things haven't changed, no need
                # to trigger recalcs
                if (column.name == old_name
                        and column.column_type == old_type
                        and column.data_type == old_d_type
                        and column.measure_type == old_m_type
                        and column.formula == old_formula
                        and column.filter_no == old_filter_no
                        and column.levels == old_levels
                        and column.active == old_active
                        and column.trim_levels == old_trim
                        and column.transform == old_transform
                        and column.parent_id == old_parent_id
                        and column.missing_values == old_missing_values):
                    continue

                recalc.add(column)

                if column.formula != old_formula:
                    reparse.add(column)
                elif column.transform != old_transform:
                    reparse.add(column)
                elif column.parent_id != old_parent_id:
                    reparse.add(column)
                elif column.active != old_active:
                    # this is only relevant for filters
                    reparse.add(column)
                    for filter in self._data:
                        if not filter.is_filter:
                            break
                        # reparse subsequent filters
                        if filter.filter_no > column.filter_no:
                            reparse.add(filter)
                elif old_name != column.name:          # if a name has changed, then
                    reparse.update(column.dependents)  # dep columns need to be reparsed
                elif old_d_type != column.data_type:
                    reparse.update(column.dependents)
                elif old_m_type != column.measure_type:
                    reparse.update(column.dependents)

            for i in range(n_cols_before, self._data.total_column_count):  # cols added
                column = self._data[i]
                cols_changed.add(column)

        # handle transform deletions
        for trans_pb in request.schema.transforms:
            if trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('REMOVE'):
                self._mod_tracker.log_transform_deletion(self._data.get_transform_by_id(trans_pb.id))
                removed_transform = self._data.remove_transform(trans_pb.id)
                changes['deleted_transforms'].add(removed_transform)
                for column in self._data:
                    if column.transform == trans_pb.id:
                        column.transform = 0
                        reparse.add(column)
                        parent_name = ''
                        if column.parent_id > 0:
                            parent = self._data.get_column_by_id(column.parent_id)
                            parent_name = parent.name
                        new_column_name = self._calc_column_name(column, parent_name, removed_transform.get_suffix())
                        self._apply_column_name(column, new_column_name, cols_changed, reparse)

        # dependent columns need to be reparsed too
        dependents = set()
        for column in reparse:
            dependents.update(column.dependents)
        reparse.update(dependents)

        # see if we can clear errors in other transforms
        # maybe something has changed as a result of a column
        # being renamed
        for trans in self._data.transforms:
            if trans in trans_changed:  # skip ones already processed
                continue
            if trans.in_error:  # broken
                trans.parse_formula()
                if not trans.in_error:  # fixed
                    reparse.update(trans.dependents)
                    trans_changed.add(trans)

        # see if we can clear errors in other columns
        for column in self._data:
            if column.formula_message != '':
                reparse.add(column)

        for column in reparse:
            column.set_needs_parse()
        for column in reparse:
            column.parse_formula()

        recalc.update(reparse)

        dependents = set()
        for column in recalc:
            dependents.update(column.dependents)
        recalc.update(dependents)

        filter_changed = False
        for column in recalc:
            # if a filter has changed, recalc everything
            if column.is_filter:
                filter_changed = True
                recalc = self._data
                break

        for column in recalc:
            column.set_needs_recalc()
        for column in recalc:
            column.recalc()

        cols_changed.update(recalc)

        if len(cols_changed) > 0 or len(trans_changed) > 0:
            self._data.is_edited = True

        if filter_changed:
            changes['filters_changed'] = True

        for column in cols_changed:
            changes['columns'].add(column)
        for transform in trans_changed:
            changes['transforms'].add(transform)
        for column in recalc:
            changes['data_changed'].add(column)

    def _parse_cells(self, request):
        main_settings = self._settings.group('main')
        if request.incData:
            block_count = len(request.data)
            blocks = [None] * block_count
            bottom_most_row_index = -1
            right_most_column_index = -1
            size = 0

            for i in range(block_count):
                block_pb = request.data[i]
                block = { 'row_start': block_pb.rowStart, 'column_start': block_pb.columnStart }
                blocks[i] = block
                row_count = 0
                col_count = 0
                if block_pb.incCBData:
                    cells = None
                    if block_pb.cbHtml != '':
                        dec_symbol = main_settings.get('decSymbol', '.')
                        parser = HTMLParser(dec_symbol=dec_symbol)
                        parser.feed(block_pb.cbHtml)
                        parser.close()
                        cells = parser.result()
                        size += self._mod_tracker.get_size_of(block_pb.cbHtml)
                    else:
                        dec_symbol = main_settings.get('decSymbol', '.')
                        parser = CSVParser(dec_symbol=dec_symbol)
                        parser.feed(block_pb.cbText)
                        parser.close()
                        cells = parser.result()
                        size += self._mod_tracker.get_size_of(block_pb.cbText)

                    row_count = 0
                    if (len(cells) > 0):
                        row_count = len(cells[0])
                    col_count = len(cells)

                    if block_pb.rowCount % row_count  == 0 and block_pb.columnCount % col_count == 0:
                        row_count = block_pb.rowCount
                        col_count = block_pb.columnCount
                        new_cells = []
                        for cc in range(col_count):
                            new_rows = []
                            new_cells.append(new_rows)
                            for rr in range(row_count):
                                col_val = cells[cc % len(cells)]
                                new_rows.append(col_val[rr % len(col_val)])
                        cells = new_cells

                    block['row_count'] = row_count
                    block['column_count'] = col_count
                    block['values'] = cells
                    block['clear'] = False
                else:
                    row_count = block_pb.rowCount
                    col_count = block_pb.columnCount
                    cells = [None] * col_count
                    block['row_count'] = row_count
                    block['column_count'] = col_count
                    block['clear'] = block_pb.clear
                    block['values'] = cells
                    is_actually_clear = True
                    for c in range(col_count):
                        cells[c] = [None] * row_count
                        if block_pb.clear is False:
                            for r in range(row_count):
                                cell_pb = block_pb.values[(c * row_count) + r]
                                if cell_pb.HasField('o'):
                                    cells[c][r] = None
                                elif cell_pb.HasField('d'):
                                    cells[c][r] = cell_pb.d
                                    is_actually_clear = False
                                elif cell_pb.HasField('i'):
                                    cells[c][r] = cell_pb.i
                                    is_actually_clear = False
                                elif cell_pb.HasField('s'):
                                    cells[c][r] = cell_pb.s
                                    is_actually_clear = False
                            size += self._mod_tracker.get_size_of(cells[c][r])
                    if is_actually_clear != block['clear']:
                        block['clear'] = is_actually_clear

                if block_pb.clear is False:
                    if right_most_column_index < block_pb.columnStart + col_count - 1:
                        right_most_column_index = block_pb.columnStart + col_count - 1
                    if bottom_most_row_index < block_pb.rowStart + row_count - 1:
                        bottom_most_row_index = block_pb.rowStart + row_count - 1
                else:
                    size = 0
                    bottom_most_row_index = -1
                    right_most_column_index = -1

            self._mod_tracker.log_space_used(size)

            return blocks, bottom_most_row_index, right_most_column_index
        else:
            return [ ], -1, -1

    def _get_column(self, index, base=0, is_display_index=False):
        data = { 'column': None, index: -1 }
        if is_display_index is True:
            count = 0
            i = 0
            while True:
                next_index = base + count + i
                if next_index >= self._data.total_column_count:
                    break
                column = self._data[next_index]
                if column.hidden is False:
                    data['column'] = column
                    data['index'] = count
                    if count == index:
                        break
                    count += 1
                else:
                    i += 1
        else:
            next_index = base + index
            if next_index < self._data.total_column_count:
                data['column'] = self._data[next_index]
                data['index'] = next_index

        return data

    def _apply_cells(self, request, response, changes):

        data, bottom_most_row_index, right_most_column_index = self._parse_cells(request)

        if len(data) == 0:
            return

        if self._data.ex_filtered and self._data.has_filters:
            # Some operations are forbidden when filtered rows are hidden/excluded
            for block in data:
                column_start = block['column_start']
                column_count = block['column_count']
                column_end = column_start + column_count

                for column in islice(self._data.columns_ex_hidden, column_start, column_end):
                    if any(dep.is_filter for dep in column.dependents):
                        raise ForbiddenOp(
                            _('Could not modify columns'),
                            _('You cannot modify columns that affect filters when filtered rows are hidden'))

        data_list = []

        del response.data[:]
        response.incData = True
        for block in data:
            n_block = response.data.add()
            n_block.rowStart = block['row_start']
            n_block.columnStart = block['column_start']
            n_block.rowCount = block['row_count']
            n_block.columnCount = block['column_count']
            n_block.clear = block['clear']
            self._mod_tracker.log_data_write(n_block)

        cols_changed = set()  # schema changes to send
        reparse = set()
        recalc = set()  # computed columns that need to update from these changes

        n_cols_before = self._data.total_column_count
        n_rows_before = self._data.row_count
        expected_n_rows = self._data.row_count

        if bottom_most_row_index >= self._data.row_count:
            expected_n_rows = bottom_most_row_index + 1

        if right_most_column_index != -1:
            right_most_column_data = self._get_column(right_most_column_index, 0, True)
            right_most_index = right_most_column_data['column'].index + (right_most_column_index - right_most_column_data['index'])  # right_most_column_index is a display index and _get_column will return the last column that
            for i in range(self._data.column_count, right_most_index + 1):
                column = self._data[i]
                if column.is_virtual:
                    column.realise()
                    cols_changed.add(column)
                    self._mod_tracker.log_column_realisation(column)

        for block in data:
            col_start = block['column_start']
            row_start = block['row_start']
            row_count = block['row_count']
            col_count = block['column_count']

            if row_count == 0 or col_count == 0:
                continue

            if row_start >= expected_n_rows:
                continue

            if row_start + row_count - 1 >= expected_n_rows:
                row_count = expected_n_rows - row_start

            base_index = 0
            search_index = col_start
            data_col_count = 0
            for i in range(col_count):

                column_data = self._get_column(search_index, base_index, True)
                column = column_data['column']

                if column is None:
                    break

                base_index = column.index + 1
                search_index = 0

                if column.is_virtual is False and column.column_type not in { ColumnType.COMPUTED, ColumnType.RECODED, ColumnType.FILTER }:
                    data_list.append({ 'column': column, 'row_start': row_start, 'row_count': row_count, 'values': block['values'][i] })

                if column.column_type == ColumnType.DATA or column.column_type == ColumnType.NONE:
                    data_col_count += 1

                if col_count == 1:
                    if column.column_type == ColumnType.COMPUTED:
                        raise TypeError(_("Cannot assign to computed column '{}'").format(column.name))
                    elif column.column_type == ColumnType.RECODED:
                        raise TypeError(_("Cannot assign to recoded column '{}'").format(column.name))
                    elif column.column_type == ColumnType.FILTER:
                        raise TypeError(_("Cannot assign to filter column '{}'").format(column.name))

                if column.auto_measure:
                    continue  # skip checks

                values = block['values'][i]

                if column.data_type == DataType.DECIMAL:

                    # automagically convert euro floats
                    euro_floats: bool = True

                    for value in values:
                        if value is None or value == '':
                            continue
                        elif isinstance(value, float):
                            euro_floats = False
                            break
                        elif isinstance(value, str):
                            if not EURO_REGEX.match(value):
                                euro_floats = False
                                break

                    for i, value in enumerate(values):
                        if value is None or value == '':
                            pass
                        elif isinstance(value, int) or isinstance(value, float):
                            pass
                        elif euro_floats:
                            # convert euro floats
                            values[i] = float(value.replace(',', '.'))
                        else:
                            raise TypeError(_("Cannot assign non-numeric value to column '{}'").format(column.name))

                elif column.data_type == DataType.INTEGER:
                    for value in values:
                        if value is None or value == '':
                            pass
                        elif not isinstance(value, int):
                            if column.measure_type == MeasureType.CONTINUOUS:
                                raise TypeError(_("Cannot assign non-integer value to column '{}'").format(column.name))
                        elif not is_int32(value):
                            raise TypeError(_("Value is too large for column '{}' of type integer").format(column.name))

            if col_count > 0 and data_col_count == 0:
                raise TypeError(_("Cannot assign to these columns."))

        if bottom_most_row_index >= self._data.row_count:
            self._mod_tracker.log_rows_appended(self._data.row_count, bottom_most_row_index)
            self._data.set_row_count(bottom_most_row_index + 1)

        filter_changed = False

        for data_item in data_list:
            column = data_item['column']
            row_start = data_item['row_start']
            row_count = data_item['row_count']
            values = data_item['values']

            if self._data.ex_filtered and self._data.has_filters:
                indices_map = self._data.get_indices_ex_filtered(row_start, row_count)
            else:
                indices_map = list(range(row_start, row_start + row_count))

            column.column_type = ColumnType.DATA
            column.set_needs_recalc()  # invalidate dependent nodes

            was_virtual = column.is_virtual
            column_changes = column.changes

            if column.auto_measure:  # change data type if necessary

                dt = column.data_type
                mt = column.measure_type

                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        pass
                    elif isinstance(value, int):
                        if dt is not DataType.TEXT and not is_int32(value):
                            dt = DataType.DECIMAL
                            mt = MeasureType.CONTINUOUS
                    elif isinstance(value, float):
                        if dt is not DataType.TEXT:
                            dt = DataType.DECIMAL
                            mt = MeasureType.CONTINUOUS
                    elif isinstance(value, str):
                        dt = DataType.TEXT
                        if mt is MeasureType.CONTINUOUS:
                            mt = MeasureType.NOMINAL

                if dt != column.data_type:
                    column.change(data_type=dt, measure_type=mt)

            if column.data_type == DataType.DECIMAL:
                nan = float('nan')
                for j in range(row_count):
                    value = values[j]
                    row_no = indices_map[j]

                    if value is None or value == '':
                        column.set_value(row_no, nan)
                    elif isinstance(value, float):
                        column.set_value(row_no, value)
                    elif isinstance(value, int):
                        column.set_value(row_no, float(value))
                    else:
                        raise TypeError(_("Cannot assign non-numeric value to column '{}'"), column.name)

            elif column.data_type == DataType.TEXT:
                for j in range(row_count):
                    value = values[j]
                    row_no = indices_map[j]

                    if value is None or value == '':
                        column.clear_at(row_no)
                        continue

                    if isinstance(value, float):
                        if math.isnan(value):
                            value = ''
                        else:
                            value = str(value)
                    else:
                        value = str(value)

                    if column.measure_type == MeasureType.ID:
                        column.set_value(row_no, value)
                    else:
                        column.clear_at(row_no)  # necessary to clear first with TEXT
                        if value == '':
                            index = -2147483648
                        elif not column.has_level(value):
                            index = column.level_count
                            column.insert_level(index, value)
                        else:
                            index = column.get_value_for_label(value)
                        column.set_value(row_no, index)

            else:  # elif column.data_type == DataType.INTEGER:
                for j in range(row_count):
                    value = values[j]
                    row_no = indices_map[j]

                    if value is None or value == '':
                        column.clear_at(row_no)
                    elif isinstance(value, int):
                        if column.measure_type != MeasureType.ID:
                            if not column.has_level(value) and value != -2147483648:
                                column.insert_level(value, str(value))
                        column.set_value(row_no, value)
                    elif isinstance(value, str):
                        if column.measure_type == MeasureType.ID:
                            raise RuntimeError('Should not get here')
                        elif column.measure_type == MeasureType.CONTINUOUS:
                            raise RuntimeError('Should not get here')
                        elif column.has_level(value):
                            index = column.get_value_for_label(value)
                        else:
                            column.clear_at(row_no)
                            index = 0
                            for level in column.levels:
                                index = max(index, level[0])
                            index += 1
                            column.insert_level(index, value, str(index))
                        column.set_value(row_no, index)
                    else:
                        raise RuntimeError('Should not get here')

            if self._data.ex_filtered and self._data.has_filters:
                for row_no in indices_map:
                    self._mod_tracker.set_cells_as_edited(column, row_no, row_no)
            else:
                self._mod_tracker.set_cells_as_edited(column, row_start, row_start + row_count - 1)

            cols_changed.add(column)

            if column.auto_measure:
                self._auto_adjust(column)
            elif column.data_type == DataType.DECIMAL:
                column.determine_dps()

            if column_changes != column.changes or was_virtual:
                # if a schema change
                cols_changed.add(column)
                # reparse dependents, as it may impact their data/measure type
                reparse.update(column.dependents)

            dependents = column.dependents
            recalc.update(dependents)
            cols_changed.update(dependents)

            for dep in dependents:
                if dep.is_filter:
                    filter_changed = True

        self._data.is_edited = True

        for i in range(n_cols_before, self._data.total_column_count):  # cols added
            column = self._data[i]
            cols_changed.add(column)

        n_rows_changed = (n_rows_before != self._data.row_count)

        if n_rows_changed:
            recalc = self._data  # if more rows recalc all
            cols_changed = self._data  # send *all* column schemas
        else:
            # sort ascending (the client doesn't like them out of order)
            cols_changed = sorted(cols_changed, key=lambda x: x.index)

        for column in reparse:
            column.set_needs_parse()
        for column in reparse:
            column.parse_formula()
        for column in recalc:
            column.set_needs_recalc()
        for column in recalc:
            column.recalc()

        if filter_changed or n_rows_changed:
            changes['filters_changed'] = True

        for column in cols_changed:
            changes['columns'].add(column)
            changes['data_changed'].add(column)

        self._populate_cells(request, response)

    def _auto_adjust(self, column):

        if column.data_type == DataType.TEXT:

            d_type = DataType.INTEGER
            m_type = MeasureType.NOMINAL

            try:
                for level in column.levels:
                    value = float(level[1])
                    if d_type is DataType.INTEGER:
                        if not math.isclose(value % 1, 0.0):
                            d_type = DataType.DECIMAL
                            m_type = MeasureType.CONTINUOUS
                        if not is_int32(value):
                            d_type = DataType.DECIMAL
                            m_type = MeasureType.CONTINUOUS

                column.change(data_type=d_type, measure_type=m_type)

            except ValueError:
                # don't change
                pass

        elif column.data_type == DataType.DECIMAL:
            for value in column:
                if math.isnan(value):
                    continue
                if not math.isclose(value % 1, 0.0):
                    # don't change
                    break
                if not is_int32(value):
                    # don't change
                    break
            else:
                column.change(
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.NOMINAL)
                return

            column.determine_dps()

    def _populate_cells(self, request, response):

        for block_pb in response.data:
            col_start = block_pb.columnStart
            row_start = block_pb.rowStart
            row_count = block_pb.rowCount
            col_count = block_pb.columnCount

            row_data = response.rows.add()
            row_data.rowStart = row_start
            row_data.rowCount = row_count
            row_data.action = jcoms.DataSetRR.RowData.RowDataAction.Value('MODIFY')

            row_nums = range(row_start, row_start + row_count)

            if not self._data.ex_filtered:
                filtered = map(lambda row_no: self._data.is_row_filtered(row_no), row_nums)
                filtered = map(lambda filtered: 1 if filtered else 0, filtered)
                row_data.filterData = bytes(filtered)
                indices_map = list(range(row_start, row_start + row_count))
            else:
                row_nums = map(lambda row_no: self._data.get_index_ex_filtered(row_no), row_nums)
                row_data.rowNums[:] = row_nums
                indices_map = self._data.get_indices_ex_filtered(row_start, row_count)

            base_index = 0
            search_index = col_start
            for cc in range(col_count):
                column_data = self._get_column(search_index, base_index, True)
                column = column_data['column']

                if column is None:
                    break

                base_index = column.index + 1
                search_index = 0

                if column.data_type == DataType.DECIMAL:
                    for j in range(row_count):
                        cell = block_pb.values.add()
                        row_no = indices_map[j]
                        if row_no >= self._data.row_count:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            v = column.get_value(row_no, True)
                            if math.isnan(v.value):
                                cell.o = jcoms.SpecialValues.Value('MISSING')
                            else:
                                cell.d = v.value
                            if v.missing:
                                cell.missing = True
                elif column.data_type == DataType.TEXT:
                    for j in range(row_count):
                        cell = block_pb.values.add()
                        row_no = indices_map[j]
                        if row_no >= self._data.row_count:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            v = column.get_value(row_no, True)
                            if v.value == '':
                                cell.o = jcoms.SpecialValues.Value('MISSING')
                            else:
                                cell.s = v.value
                            if v.missing:
                                cell.missing = True
                else:
                    for j in range(row_count):
                        cell = block_pb.values.add()
                        row_no = indices_map[j]
                        if row_no >= self._data.row_count:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            v = column.get_value(row_no, True)
                            if v.value == -2147483648:
                                cell.o = jcoms.SpecialValues.Value('MISSING')
                            else:
                                cell.i = v.value
                            if v.missing:
                                cell.missing = True

    def _populate_schema(self, request, response):
        response.incSchema = True
        self.populate_schema(response.schema)

    def populate_schema(self, schema):
        """Fill a DataSetSchema with the full column and transform schema."""
        self._populate_schema_counts(schema)
        for column in self._data:
            column_schema = schema.columns.add()
            self.populate_column_schema(column, column_schema, False)
        for transform in self._data.transforms:
            transform_schema = schema.transforms.add()
            self._populate_transform_schema(transform, transform_schema)

    def populate_schema_info(self, request, response):
        response.incSchema = True
        self._populate_schema_counts(response.schema)

    def _populate_schema_counts(self, schema):
        schema.rowCount = self._data.row_count
        schema.vRowCount = self._data.virtual_row_count
        schema.columnCount = self._data.column_count
        schema.vColumnCount = self._data.visible_column_count
        schema.tColumnCount = self._data.total_column_count
        schema.deletedRowCount = self._data.row_tracker.total_removed_row_count
        schema.addedRowCount = self._data.row_tracker.total_added_row_count
        schema.editedCellCount = self._data.total_edited_cell_count
        schema.rowCountExFiltered = self._data.row_count_ex_filtered
        schema.filtersVisible = self._data.filters_visible

        if self._data.row_tracker.is_edited:
            for range in self._data.row_tracker.removed_row_ranges:
                row_range_pb = schema.removedRowRanges.add()
                row_range_pb.index = range['index']
                row_range_pb.count = range['count']

    def _populate_transform_schema(self, transform, transform_schema):
        transform_schema.name = transform.name
        transform_schema.id = transform.id
        transform_schema.formula[:] = transform.formula
        transform_schema.formulaMessage[:] = transform.formula_message
        transform_schema.description = transform.description
        transform_schema.suffix = transform.suffix
        transform_schema.measureType = transform.measure_type.value
        transform_schema.colourIndex = transform.colour_index

    def populate_column_schema(self, column, column_schema, data_changed):
        column_schema.name = column.name
        column_schema.importName = column.import_name
        column_schema.id = column.id
        column_schema.index = column.index
        column_schema.dataChanged = data_changed

        column_schema.columnType = column.column_type.value
        column_schema.dataType = column.data_type.value
        column_schema.measureType = column.measure_type.value
        column_schema.autoMeasure = column.auto_measure
        column_schema.missingValues[:] = column.missing_values
        column_schema.width = column.width

        column_schema.dps = column.dps
        column_schema.formula = column.formula
        column_schema.formulaMessage = column.formula_message
        column_schema.description = column.description
        column_schema.hidden = column.hidden
        column_schema.active = column.active
        column_schema.filterNo = column.filter_no
        column_schema.trimLevels = column.trim_levels
        column_schema.transform = column.transform
        column_schema.parentId = column.parent_id
        column_schema.outputAnalysisId = column.output_analysis_id

        column_schema.hasLevels = True

        if column.has_levels:
            for level in column.levels:
                level_pb = column_schema.levels.add()
                level_pb.value = level[0]
                level_pb.label = level[1]
                level_pb.importValue = level[2]
                level_pb.pinned = level[3]
                level_pb.filtered = level[4]
                level_pb.treatAsMissing = level[5]

        if column.cell_tracker.is_edited:
            for range in column.cell_tracker.edited_cell_ranges:
                cell_range_pb = column_schema.editedCellRanges.add()
                cell_range_pb.start = range['start']
                cell_range_pb.end = range['end']

