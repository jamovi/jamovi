

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType

import re
import math


def calc_dps(value, max_dp=3):
    if math.isnan(value):
        return 0
    if not math.isfinite(value):
        return 0

    max_dp_required = 0
    value %= 1
    as_string = '{v:.{dp}f}'.format(v=value, dp=max_dp)
    as_string = as_string[2:]

    for dp in range(max_dp, 0, -1):
        index = dp - 1
        if as_string[index] != '0':
            max_dp_required = dp
            break

    return max_dp_required


class Reader:

    def __init__(self, settings):
        self._settings = settings
        self._total = 0

    def set_total(self, total):
        self._total = total

    def open(self, path):
        raise NotImplementedError

    def close(self):
        raise NotImplementedError

    def progress(self):
        raise NotImplementedError

    def __iter__(self):
        raise NotImplementedError

    def read_into(self, data, path, prog_cb):

        self.open(path)

        column_names = next(iter(self))

        column_count = 0
        column_readers = [ ]

        if len(column_names) == 0:
            column_names = ['A']

        for i, column_name in enumerate(column_names):
            if column_name is None:
                column_name = ''
            data.append_column(column_name)
            column = data[i]
            column.column_type = ColumnType.DATA
            column_readers.append(ColumnReader(column, i, self._settings))
            column_count += 1

        row_count = 0
        empty_count = 0  # we exclude empty rows at the end of the data set
        first = True

        for row in self:
            if first:
                first = False
            else:
                empty_row = True
                for i in range(column_count):
                    not_empty = column_readers[i].examine_row(row)
                    if not_empty:
                        empty_row = False

                if empty_row:
                    # if the row is empty, we exclude it ...
                    empty_count += 1
                else:
                    # ... unless its followed by a not empty row
                    row_count += empty_count + 1
                    empty_count = 0

            if (row_count + empty_count) % 1000 == 0:
                prog_cb(0.33333 * self.progress() / self._total)

        for column_reader in column_readers:
            column_reader.ruminate()

        data.set_row_count(row_count)

        first = True

        row_no = 0

        for row in self:
            if first:
                first = False
            else:
                if row_no >= row_count:
                    break
                for i in range(column_count):
                    column_readers[i].parse_row(row, row_no)
                row_no += 1

            if row_no % 1000 == 0:
                prog_cb(.33333 + .66666 * self.progress() / self._total)

        self.close()


euro_float_pattern = re.compile(r'^(-)?([0-9]*),([0-9]+)$')
EURO_FLOAT_REPL = r'\1\2.\3'


class ColumnReader:

    def _is_euro_float(self, v):
        if euro_float_pattern.match(v):
            return True
        return False

    def _parse_euro_float(self, v):
        v = re.sub(
            euro_float_pattern,
            EURO_FLOAT_REPL,
            v)
        return float(v)

    def __init__(self, column, column_index, settings):
        self._column = column
        self._column_index = column_index
        self._missings = settings.get('missings', 'NA')

        self._only_integers = True
        self._only_floats = True
        self._only_euro_floats = True
        self._is_empty = True
        self._unique_values = set()
        self._n_uniques = 0
        self._many_uniques = False
        self._measure_type = None
        self._data_type = None
        self._ruminated = False
        self._dps = 0

    def examine_row(self, row) -> bool:

        if self._column_index >= len(row):
            return False

        value = row[self._column_index]

        if value in (None, self._missings, '', ' '):
            return False

        self._is_empty = False

        if not self._many_uniques:
            if value not in self._unique_values:
                self._unique_values.add(value)
                self._n_uniques += 1
                if self._n_uniques > 49:
                    self._many_uniques = True

        try:
            i = int(value)
            if i > 2147483647 or i < -2147483648:
                self._only_integers = False
        except ValueError:
            self._only_integers = False

            try:
                f = float(value)

                # we always calc dps, even if we know the column isn't going to be
                # continuous. the user might change it *to* continuous later.
                self._dps = max(self._dps, calc_dps(f))
                self._only_euro_floats = False
            except ValueError:
                self._only_floats = False

                if self._only_euro_floats and self._is_euro_float(value):
                    f = self._parse_euro_float(value)
                    self._dps = max(self._dps, calc_dps(f))
                else:
                    self._only_euro_floats = False

        return True

    def ruminate(self):

        if self._only_integers:
            if self._many_uniques is False:
                self._data_type = DataType.INTEGER
                self._measure_type = MeasureType.NOMINAL
                self._column.change(
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.NOMINAL)

                self._unique_values = list(self._unique_values)
                self._unique_values = list(map(int, self._unique_values))
                self._unique_values.sort()
                for level in self._unique_values:
                    self._column.append_level(level, str(level))
            else:
                self._data_type = DataType.INTEGER
                self._measure_type = MeasureType.CONTINUOUS
                self._column.change(
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.CONTINUOUS)

        elif self._only_floats or self._only_euro_floats:
            self._data_type = DataType.DECIMAL
            self._measure_type = MeasureType.CONTINUOUS
            self._column.change(
                data_type=DataType.DECIMAL,
                measure_type=MeasureType.CONTINUOUS)

            if self._only_floats and self._only_euro_floats:
                self._only_euro_floats = False

        else:
            if self._many_uniques is False:
                self._data_type = DataType.TEXT
                self._measure_type = MeasureType.NOMINAL
                self._column.change(
                    data_type=DataType.TEXT,
                    measure_type=MeasureType.NOMINAL)

                self._unique_values = list(self._unique_values)
                self._unique_values.sort()
                for i, label in enumerate(self._unique_values):
                    self._column.append_level(i, label)
            else:
                self._data_type = DataType.TEXT
                self._measure_type = MeasureType.ID
                self._column.change(
                    data_type=DataType.TEXT,
                    measure_type=MeasureType.ID)

        self._column.dps = self._dps
        self._ruminated = True

    def parse_row(self, row, row_no):

        if self._ruminated is False:
            self.ruminate()

        if self._column_index >= len(row):
            value = None
        else:
            value = row[self._column_index]

            if value in (self._missings, '', ' '):
                value = None

        if self._data_type == DataType.INTEGER:
            if value is None:
                self._column.clear_at(row_no)
            else:
                self._column.set_value(row_no, int(value))

        elif self._data_type == DataType.DECIMAL:

            if value is None:
                self._column.set_value(row_no, float('nan'))
            else:
                if self._only_euro_floats:
                    value = re.sub(
                        euro_float_pattern,
                        EURO_FLOAT_REPL,
                        value)
                self._column.set_value(row_no, float(value))

        elif self._data_type == DataType.TEXT:

            if self._measure_type != MeasureType.ID:
                if value is None:
                    self._column.set_value(row_no, -2147483648)
                else:
                    index = self._unique_values.index(value)
                    self._column.set_value(row_no, index)
            elif self._measure_type is MeasureType.ID:
                if value is None:
                    self._column.set_value(row_no, '')
                else:
                    self._column.set_value(row_no, str(value))

        else:
            self._column.clear_at(row_no)
