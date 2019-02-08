
from jamovi.core import ColumnType
from jamovi.core import DataType
import math
import sys

from . import jamovi_pb2 as jcoms


class ModTracker:

    MAX_SPACE_AVALIABLE = 52428800
    MAX_HISTORY_LENGTH = 1000

    def __init__(self, _data):
        self._data = _data
        self._history = []
        self._pos = -1
        self._blank_event = jcoms.DataSetRR()
        self._blank_event.op = jcoms.GetSet.Value('SET')
        self._active = False
        self._suspend_cell_tracking = False

    def clear(self):
        self._history = []
        self._pos = -1
        self._blank_event = jcoms.DataSetRR()
        self._blank_event.op = jcoms.GetSet.Value('SET')
        self._active = False
        self._suspend_cell_tracking = False

    @property
    def count(self):
        return len(self._history)

    @property
    def position(self):
        return self._pos

    @property
    def can_undo(self):
        return self._pos > -1

    @property
    def can_redo(self):
        return self._pos < len(self._history) - 1

    @property
    def history(self):
        return self._history

    @history.setter
    def history(self, history):
        self._history = history

    def begin_event(self, event):
        self._active = True
        if event.op == jcoms.GetSet.Value('SET'):
            if self._pos < len(self._history) - 1:
                self._history = self._history[0:(self._pos + 1)]

            if len(self._history) == 0:
                event_data = { 'redo': event }
                self._history.append(event_data)
                event_data['space_used'] = sys.getsizeof(event)
                self._pos = 0
            else:
                event_data = self._history[len(self._history) - 1]
                event_data['redo'] = event
                # event_data['space_used'] = sys.getsizeof(event)

            self._create_undo_event_data(event)

    def get_size_of(self, obj):
        return sys.getsizeof(obj)

    def end_event(self):
        last_size = 0
        if self._pos > 0:
            prev_event_data = self._history[self._pos - 1]
            last_size = prev_event_data['space_used']

        event_data = self._history[self._pos]

        event_data['space_used'] = last_size + event_data['space_used']

        make_space = event_data['space_used'] - ModTracker.MAX_SPACE_AVALIABLE
        if make_space > 0:
            start = -1
            offset = 0
            for i in range(len(self._history)):
                data = self._history[i]
                if offset > 0:
                    data['space_used'] -= offset
                elif data['space_used'] >= make_space:
                    start = i
                    offset = data['space_used']

            if start == 0:
                self._history = []
            else:
                self._history = self._history[start + 1:(len(self._history))]

            if len(self._history) > ModTracker.MAX_HISTORY_LENGTH:
                self._history = self._history[-ModTracker.MAX_HISTORY_LENGTH:]

            self._pos = len(self._history) - 1

        self._active = False

    def begin_undo(self):
        if self._pos <= 0:
            return self._blank_event

        self._suspend_cell_tracking = True

        inv_event = self._history[self._pos]['undo']

        return inv_event

    def end_undo(self, response):

        self._suspend_cell_tracking = False

        if self._pos > 0:
            state_data = self._history[self._pos]

            row_changes = state_data['row_changes']
            self._data.row_tracker.state_id = row_changes['state_id']
            removed_ranges = []
            for removed_range in row_changes['removed_ranges']:
                removed_ranges.append({'index': removed_range['index'], 'count': removed_range['count']})
            self._data.row_tracker.removed_row_ranges = removed_ranges
            added_ranges = []
            for added_range in row_changes['added_ranges']:
                added_ranges.append({'start': added_range['start'], 'end': added_range['end']})
            self._data.row_tracker.added_row_ranges = added_ranges

            changes = state_data['changes']
            for id in changes:
                column = self._data.get_column_by_id(id)
                if column.cell_tracker.state_id != changes[id]['state_id']:
                    column.cell_tracker.state_id = changes[id]['state_id']
                    ranges = []
                    for range in changes[id]['ranges']:
                        ranges.append({'start': range['start'], 'end': range['end']})
                    column.cell_tracker.edited_cell_ranges = ranges

                    column_schema = None
                    for column_pb in response.schema.columns:
                        if column_pb.id == id:
                            column_schema = column_pb
                            break
                    if column_schema is None:
                        column_schema = response.schema.columns.add()
                        self._populate_column_schema(column, column_schema)
                    else:
                        del column_schema.editedCellRanges[:]

                    for range in column.cell_tracker.edited_cell_ranges:
                        cell_range_pb = column_schema.editedCellRanges.add()
                        cell_range_pb.start = range['start']
                        cell_range_pb.end = range['end']

            response.schema.deletedRowCount = self._data.row_tracker.total_removed_row_count
            response.schema.addedRowCount = self._data.row_tracker.total_added_row_count
            response.schema.editedCellCount = self._data.total_edited_cell_count

            self._pos = self._pos - 1

    def get_redo(self):
        if self._pos == (len(self._history) - 1):
            return self._blank_event

        event = self._history[self._pos]['redo']
        self._pos = self._pos + 1
        return event

    def _create_undo_event_data(self, event):
        data = { }
        inv_event = jcoms.DataSetRR()
        inv_event.op = jcoms.GetSet.Value('SET')

        prev_state = None
        if len(self._history) > 1:
            prev_state = self._history[len(self._history) - 1]

        data['undo'] = inv_event
        data['space_used'] = 0
        changes = { }
        for column in self._data:
            if column.is_virtual:
                break
            state_id = column.cell_tracker.state_id
            ranges = []
            changed = True
            if prev_state is not None and 'changes' in prev_state:
                if column.id in prev_state['changes']:
                    prev_column_state = prev_state['changes'][column.id]
                    if prev_column_state['state_id'] == state_id:
                        ranges = prev_column_state['ranges']
                        changed = False

            if changed:
                for range in column.cell_tracker.edited_cell_ranges:
                    ranges.append({'start': range['start'], 'end': range['end']})

            changes[column.id] = {'state_id': state_id, 'ranges': ranges, 'changed': changed }

        data['changes'] = changes

        row_changed = True
        removed_ranges = []
        added_ranges = []
        if prev_state is not None and 'row_changes' in prev_state:
            if prev_state['row_changes']['state_id'] == self._data.row_tracker.state_id:
                row_changed = False
                removed_ranges = prev_state['row_changes']['removed_ranges']
                added_ranges = prev_state['row_changes']['added_ranges']

        if row_changed:
            for removed_range in self._data.row_tracker.removed_row_ranges:
                removed_ranges.append({'index': removed_range['index'], 'count': removed_range['count']})
            for added_range in self._data.row_tracker.added_row_ranges:
                added_ranges.append({'start': added_range['start'], 'end': added_range['end']})

        data['row_changes'] = { 'state_id': self._data.row_tracker.state_id, 'removed_ranges': removed_ranges, 'added_ranges': added_ranges, 'changed': row_changed }

        self._history.append(data)
        self._pos = self._pos + 1

    def log_space_used(self, size):
        if self._active:
            event_data = self._history[self._pos - 1]
            event_data['space_used'] += size

    def log_column_modification(self, column, modify_pb):
        if self._active:
            new_event = self._history[self._pos]['undo']

            new_event.incSchema = True
            inv_column_pb = new_event.schema.columns.add()
            self._populate_column_schema(column, inv_column_pb)
            inv_column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('MODIFY')

        if self._suspend_cell_tracking is False and column.column_type is ColumnType.NONE:
            if ColumnType(modify_pb.columnType) == ColumnType.DATA:
                column.cell_tracker.set_cells_as_edited(0, self._data.row_count - 1)

    def log_transform_deletion(self, transform):
        if self._active:
            new_event = self._history[self._pos]['undo']

            transform_schema = new_event.schema.transforms.add()
            self._populate_transform_schema(transform, transform_schema)

            for column in self._data:
                if column.transform == transform.id:
                    column_pb = new_event.schema.columns.add()
                    self._populate_column_schema(column, column_pb)

    def log_column_deletion(self, column):
        if self._active:
            event_data = self._history[self._pos]
            new_event = event_data['undo']

            prev_inserts = 0
            for column_pb in new_event.schema.columns:
                if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('INSERT'):
                    if column_pb.index < column.index:
                        prev_inserts += 1
                    else:
                        column_pb.index -= 1

            inv_column_pb = new_event.schema.columns.add()
            self._populate_column_schema(column, inv_column_pb)
            inv_column_pb.index -= prev_inserts
            inv_column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('INSERT')

            if column.is_virtual is False and column.column_type not in { ColumnType.COMPUTED, ColumnType.RECODED, ColumnType.FILTER }:
                new_event.incData = True
                data_block = new_event.data.add()
                data_block.rowStart = 0
                data_block.rowCount = column.row_count
                data_block.columnStart = self._data.index_to_visible_index(column.index)
                data_block.columnCount = 1
                event_data['space_used'] += self._populate_data(data_block)

    def log_column_insertion(self, column, insert_pb):
        if self._active:
            new_event = self._history[self._pos]['undo']

            insert_pb.id = column.id

            new_event.incSchema = True
            inv_column_pb = new_event.schema.columns.add()
            inv_column_pb.id = column.id
            inv_column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')

        if self._suspend_cell_tracking is False and ColumnType(insert_pb.columnType) == ColumnType.DATA:
            column.cell_tracker.set_cells_as_edited(0, self._data.row_count - 1)

    def log_column_realisation(self, column):
        if self._active:
            new_event = self._history[self._pos]['undo']

            new_event.incSchema = True
            inv_column_pb = new_event.schema.columns.add()
            inv_column_pb.id = column.id
            inv_column_pb.columnType = ColumnType.NONE.value
            inv_column_pb.name = ''
            inv_column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('MODIFY')

        if self._suspend_cell_tracking is False:
            column.cell_tracker.set_cells_as_edited(0, self._data.row_count - 1)

    def log_data_write(self, block):
        if self._active:
            event_data = self._history[self._pos]
            new_event = event_data['undo']

            new_event.incData = True
            v_count = self._data.visible_column_count
            r_count = self._data.row_count
            if block.incCBData is False and block.columnStart < v_count and block.rowStart < r_count:
                data_block = new_event.data.add()

                row_end = block.rowStart + block.rowCount - 1
                data_block.rowStart = block.rowStart
                if row_end < r_count:
                    data_block.rowCount = block.rowCount
                else:
                    data_block.rowCount = r_count - block.rowStart

                data_block.columnStart = block.columnStart
                column_end = block.columnStart + block.columnCount - 1
                if column_end < v_count:
                    data_block.columnCount = block.columnCount
                else:
                    data_block.columnCount = v_count - block.columnStart
                event_data['space_used'] += self._populate_data(data_block)

    def log_rows_appended(self, start, end):
        if self._active:
            new_event = self._history[self._pos]['undo']

            new_block = new_event.rows.add()
            new_block.rowStart = start
            new_block.rowCount = end - start + 1
            new_block.action = jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE')

        if self._suspend_cell_tracking is False:
            for column in self._data:
                if column.column_type == ColumnType.DATA:
                    column.cell_tracker.insert_rows(start, end)

            self._data.row_tracker.log_rows_added(start, end - start + 1)

    def log_row_insertion(self, block):
        if self._active and block.action == jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT'):
            new_event = self._history[self._pos]['undo']

            new_block = new_event.rows.add()
            new_block.rowStart = block.rowStart
            new_block.rowCount = block.rowCount
            new_block.action = jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE')

        if self._suspend_cell_tracking is False:
            for column in self._data:
                if column.column_type == ColumnType.DATA:
                    column.cell_tracker.insert_rows(block.rowStart, block.rowStart + block.rowCount - 1)

            self._data.row_tracker.log_rows_added(block.rowStart, block.rowCount)

    def log_row_deletion(self, block):
        if self._active and block.action == jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE'):
            event_data = self._history[self._pos]
            new_event = event_data['undo']

            prev_inserts = 0
            for block_pb in new_event.rows:
                if block_pb.action == jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT'):
                    if block_pb.rowStart < block.rowStart:
                        prev_inserts += block_pb.rowCount
                    else:
                        block_pb.rowStart -= block.rowCount

            new_block = new_event.rows.add()
            new_block.rowStart = block.rowStart - prev_inserts
            new_block.rowCount = block.rowCount
            new_block.action = jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT')

            has_data = False
            for column in self._data:
                if column.column_type == ColumnType.DATA:
                    has_data = True
                    break

            if has_data:
                new_event.incData = True
                data_block = new_event.data.add()
                data_block.rowStart = block.rowStart
                data_block.rowCount = block.rowCount
                data_block.columnStart = 0
                data_block.columnCount = self._data.visible_real_column_count
                event_data['space_used'] += self._populate_data(data_block)

        # update cell changed tracker
        if self._suspend_cell_tracking is False:
            row_end = block.rowStart + block.rowCount - 1
            if block.rowStart < self._data.row_count:
                if row_end >= self._data.row_count:
                    row_end = self._data.row_count - 1

                self._data.row_tracker.log_rows_removed(block.rowStart, row_end)

                for column in self._data:
                    column.cell_tracker.remove_rows(block.rowStart, row_end)

    def set_cells_as_edited(self, column, row_start, row_end):
        if self._suspend_cell_tracking is False:
            column.cell_tracker.set_cells_as_edited(row_start, row_end)

    def _populate_data(self, block_pb):
        col_start = block_pb.columnStart
        row_start = block_pb.rowStart
        row_count = block_pb.rowCount
        col_count = block_pb.columnCount
        base_index = 0
        search_index = col_start
        is_clear = True
        size = 0
        end_redo = False
        for cc in range(col_count):
            if end_redo:
                break

            column = self._data.get_column(search_index, base_index, True)

            if column is None:
                break

            base_index = column.index + 1
            search_index = 0

            if column.data_type == DataType.DECIMAL:
                for r in range(row_start, row_start + row_count):
                    cell = block_pb.values.add()
                    if r >= column.row_count:
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                        size += sys.getsizeof(cell.o)
                    else:
                        value = column[r]
                        if math.isnan(value):
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                            size += sys.getsizeof(cell.o)
                        else:
                            cell.d = value
                            size += sys.getsizeof(cell.d)
                            is_clear = False
                    if is_clear is False and size > ModTracker.MAX_SPACE_AVALIABLE:
                        end_redo = True
                        break
            elif column.data_type == DataType.TEXT:
                for r in range(row_start, row_start + row_count):
                    cell = block_pb.values.add()
                    if r >= column.row_count:
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                        size += sys.getsizeof(cell.o)
                    else:
                        value = column[r]
                        if value == '':
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                            size += sys.getsizeof(cell.o)
                        else:
                            cell.s = value
                            size += sys.getsizeof(cell.s)
                            is_clear = False
                    if is_clear is False and size > ModTracker.MAX_SPACE_AVALIABLE:
                        end_redo = True
                        break
            else:
                for r in range(row_start, row_start + row_count):
                    cell = block_pb.values.add()
                    if r >= column.row_count:
                        cell.o = jcoms.SpecialValues.Value('MISSING')
                        size += sys.getsizeof(cell.o)
                    else:
                        value = column[r]
                        if value == -2147483648:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                            size += sys.getsizeof(cell.o)
                        else:
                            cell.i = value
                            is_clear = False
                            size += sys.getsizeof(cell.i)
                    if is_clear is False and size > ModTracker.MAX_SPACE_AVALIABLE:
                        end_redo = True
                        break
        if is_clear:
            block_pb.clear = True
            size = 0
            del block_pb.values[:]
        elif end_redo:
            self._active = False

        return size

    def _populate_column_schema(self, column, column_schema):
        column_schema.name = column.name
        column_schema.importName = column.import_name
        column_schema.id = column.id
        column_schema.index = column.index

        column_schema.columnType = column.column_type.value
        column_schema.dataType = column.data_type.value
        column_schema.measureType = column.measure_type.value
        column_schema.autoMeasure = column.auto_measure

        if column.column_type is ColumnType.FILTER:
            column_schema.width = 78
        else:
            column_schema.width = 100

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

        column_schema.hasLevels = True

        if column.has_levels:
            for level in column.levels:
                level_pb = column_schema.levels.add()
                level_pb.value = level[0]
                level_pb.label = level[1]
                level_pb.importValue = level[2]

        if column.cell_tracker.is_edited:
            for range in column.cell_tracker.edited_cell_ranges:
                cell_range_pb = column_schema.editedCellRanges.add()
                cell_range_pb.start = range['start']
                cell_range_pb.end = range['end']

    def _populate_transform_schema(self, transform, transform_schema):
        transform_schema.name = transform.name
        transform_schema.id = transform.id
        transform_schema.formula[:] = transform.formula
        transform_schema.formulaMessage[:] = transform.formula_message
        transform_schema.description = transform.description
        transform_schema.suffix = transform.suffix
        transform_schema.measureType = transform.measure_type.value
        transform_schema.colourIndex = transform.colour_index
