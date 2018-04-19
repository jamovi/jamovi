
from .column import Column
from .analyses import Analyses
from .utils import NullLog
from ..core import ColumnType


class InstanceModel:

    N_VIRTUAL_COLS = 5
    N_VIRTUAL_ROWS = 50

    def __init__(self):
        self._dataset = None
        self._analyses = Analyses()
        self._path = ''
        self._title = ''
        self._import_path = ''
        self._embedded_path = ''
        self._embedded_name = ''

        self._columns = [ ]
        self._next_id = 0

        self._log = NullLog()

    def __getitem__(self, index_or_name):
        if type(index_or_name) is int:
            index = index_or_name
            return self._columns[index]
        else:
            name = index_or_name
            for column in self:
                if column.name == name:
                    return column
            else:
                raise KeyError()

    def __iter__(self):
        return self._columns.__iter__()

    def set_log(self, log):
        self._log = log

    def get_column_by_id(self, id):
        for column in self:
            if column.id == id:
                return column
        else:
            raise KeyError('No such column: ' + str(id))

    def append_column(self, name, import_name=None, id=-1):

        if id != -1:
            if id < self._next_id:
                for existing_column in self:
                    if existing_column.id == id:
                        raise KeyError('Column id already exists: ' + str(id))
            self._next_id = id

        column = self._dataset.append_column(name, import_name)
        column.column_type = ColumnType.NONE
        column.id = self._next_id
        self._next_id += 1

        new_column = Column(self, column)
        new_column.index = self.total_column_count
        self._columns.append(new_column)
        return column

    def set_row_count(self, count):
        self._dataset.set_row_count(count)

    def delete_rows(self, start, end):
        self._dataset.delete_rows(start, end)
        self._recalc_all()

    def insert_rows(self, start, end):
        self._dataset.insert_rows(start, end)
        self._recalc_all()

    def insert_column(self, index, id=-1):
        if id != -1:
            if id < self._next_id:
                for existing_column in self:
                    if existing_column.id == id:
                        raise KeyError('Column id already exists: ' + str(id))
            self._next_id = id

        filter_count = self.filter_column_count

        nIndex = index
        if index >= filter_count:
            nIndex = index - filter_count
        name = self._gen_column_name(nIndex)

        ins = self._dataset.insert_column(index, name)
        ins.auto_measure = True
        ins.id = self._next_id
        self._next_id += 1

        child = self._dataset[index]
        column = Column(self, child)
        column.column_type = ColumnType.NONE
        self._columns.insert(index, column)

        index = 0
        for column in self:
            column.index = index
            index += 1

    def update_filter_names(self):
        filter_index = 0
        subfilter_index = 1
        for column in self._columns:
            if column.column_type is not ColumnType.FILTER:
                break
            if not column.is_child:
                column.name = 'Filter {}'.format(filter_index + 1)
                filter_index += 1
                subfilter_index = 1
            else:
                column.name = 'F{} ({})'.format(filter_index, subfilter_index + 1)
                subfilter_index += 1

    def delete_columns(self, start, end):
        for i in range(start, end + 1):
            parent_column = self._columns[i]
            for c in range(0, len(self._columns)):
                if c >= start and c <= end:
                    continue
                column = self._columns[c]
                if column.child_of == parent_column.id:
                    column.child_of = parent_column.child_of

        self._dataset.delete_columns(start, end)
        del self._columns[start:end + 1]

        for i in range(start, len(self._columns)):
            self._columns[i].index = i

        self.update_filter_names()

    def is_row_filtered(self, index):
        if index < self._dataset.row_count:
            return self._dataset.is_row_filtered(index)
        else:
            return False

    @property
    def title(self):
        return self._title

    @title.setter
    def title(self, title):
        self._title = title

    @property
    def analyses(self):
        return self._analyses

    @property
    def has_dataset(self):
        return self._dataset is not None

    @property
    def dataset(self):
        return self._dataset

    @dataset.setter
    def dataset(self, dataset):
        self._dataset = dataset

    def setup(self):

        self._next_id = 0

        index = 0
        for child in self._dataset:
            if index < len(self._columns):
                column = self._columns[index]
            else:
                column = Column(self, child)
                self._columns.append(column)
            column.index = index

            index += 1

            if column.id >= self._next_id:
                self._next_id = column.id + 1

        for column in self:
            if column.column_type is ColumnType.COMPUTED or column.column_type is ColumnType.FILTER:
                column.parse_formula()

        self._add_virtual_columns()

    def _add_virtual_columns(self):
        n_virtual = self.total_column_count - self.column_count
        for i in range(n_virtual, InstanceModel.N_VIRTUAL_COLS):
            index = self.total_column_count
            column = Column(self)
            column.id = self._next_id
            column.index = index
            self._columns.append(column)
            self._next_id += 1

    @property
    def path(self):
        return self._path

    @path.setter
    def path(self, path):
        self._path = path

    @property
    def import_path(self):
        return self._import_path

    @import_path.setter
    def import_path(self, path):
        self._import_path = path

    @property
    def embedded_path(self):
        return self._embedded_path

    @embedded_path.setter
    def embedded_path(self, path):
        self._embedded_path = path

    @property
    def embedded_name(self):
        return self._embedded_name

    @embedded_name.setter
    def embedded_name(self, name):
        self._embedded_name = name

    @property
    def virtual_row_count(self):
        return self._dataset.row_count + InstanceModel.N_VIRTUAL_ROWS

    @property
    def virtual_column_count(self):
        return self.total_column_count - self.column_count

    @property
    def visible_column_count(self):
        count = 0
        for column in self._columns:
            if column.hidden is False:
                count += 1
        return count

    @property
    def filter_column_count(self):
        count = 0
        for column in self._columns:
            if column.column_type == ColumnType.FILTER:
                count += 1
            else:
                break
        return count

    @property
    def total_column_count(self):
        return len(self._columns)

    @property
    def row_count(self):
        return self._dataset.row_count

    @property
    def column_count(self):
        return self._dataset.column_count

    @property
    def is_edited(self):
        return self._dataset.is_edited

    @is_edited.setter
    def is_edited(self, edited):
        self._dataset.is_edited = edited

    @property
    def is_blank(self):
        return self._dataset.is_blank

    @is_blank.setter
    def is_blank(self, blank):
        self._dataset.blank = blank

    def _gen_column_name(self, index):
        name = ''
        while True:
            i = index % 26
            name = chr(i + 65) + name
            index -= i
            index = int(index / 26)
            index -= 1
            if index < 0:
                break

        i = 2
        try_name = name
        while True:
            for column in self._dataset:
                if column.name == try_name:
                    break  # not unique
            else:
                name = try_name
                break  # unique
            try_name = name + ' (' + str(i) + ')'
            i += 1
        return name

    def _realise_column(self, column):
        index = column.index
        filter_count = self.filter_column_count
        for i in range(self.column_count, index + 1):
            name = self._gen_column_name(i - filter_count)
            child = self._dataset.append_column(name)
            wrapper = self[i]
            child.id = wrapper.id
            wrapper._child = child
            wrapper.auto_measure = True
        self._add_virtual_columns()

    def _recalc_all(self):
        for column in self:
            column.needs_recalc = True
        for column in self:
            column.recalc()

    def _print_column_info(self):
        for column in self:
            if column.has_deps:
                depts = list(map(lambda x: x.name, column.dependents))
                depcs = list(map(lambda x: x.name, column.dependencies))

                self._log.debug('Column: {}'.format(column.name))
                self._log.debug('  Needs recalc: {}'.format(column.needs_recalc))
                self._log.debug('  With dependencies:')
                self._log.debug('    {}'.format(depcs))
                self._log.debug('  With dependents:')
                self._log.debug('    {}'.format(depts))
