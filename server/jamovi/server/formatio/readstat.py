
from collections import OrderedDict
from numbers import Number
from datetime import date
import math

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType

from jamovi.readstat import Parser as ReadStatParser
from jamovi.readstat import Error as ReadStatError
from jamovi.readstat import Writer
from jamovi.readstat import Measure


def get_readers():
    return [
        ( 'sav', lambda data, path, prog_cb: read(data, path, prog_cb, 'sav') ),
        ( 'zsav', lambda data, path, prog_cb: read(data, path, prog_cb, 'sav') ),
        ( 'dta', lambda data, path, prog_cb: read(data, path, prog_cb, 'dta') ),
        ( 'por', lambda data, path, prog_cb: read(data, path, prog_cb, 'por') ),
        ( 'xpt', lambda data, path, prog_cb: read(data, path, prog_cb, 'xpt') ),
        ( 'sas7bdat', lambda data, path, prog_cb: read(data, path, prog_cb, 'sas7bdat') ) ]


def get_writers():
    return [
        ( 'sav', lambda data, path, prog_cb: write(data, path, prog_cb, 'sav') ),
        ( 'dta', lambda data, path, prog_cb: write(data, path, prog_cb, 'dta') ),
        ( 'por', lambda data, path, prog_cb: write(data, path, prog_cb, 'por') ),
        ( 'xpt', lambda data, path, prog_cb: write(data, path, prog_cb, 'xpt') ),
        ( 'sas7bdat', lambda data, path, prog_cb: write(data, path, prog_cb, 'sas7bdat') ) ]


def read(data, path, prog_cb, format):
    parser = Parser(data, prog_cb)
    parser.parse(path, format)
    for column in data.dataset:
        column.determine_dps()


TIME_START = date(1970, 1, 1)


class Parser(ReadStatParser):

    def __init__(self, data, prog_cb):

        self._data = data
        self._prog_cb = prog_cb
        self._max_row_index = 0

        self._tmp_value_labels = { }
        self._columns_by_labels_key = { }

        self._metadata = None
        self._labels = [ ]

    def parse(self, path, format):
        try:
            super().parse(path, format)
        except ReadStatError as e:
            if e.errno == 9:  # not expected no. of rows
                self._data.set_row_count(self._max_row_index + 1)
            else:
                raise e

        # some times we don't get the level labels until after the columns and
        # data have been set up. this adds them on at the end (if necessary).
        for labels_key, column in self._columns_by_labels_key.items():
            if column.data_type is DataType.INTEGER:
                value_labels = self._tmp_value_labels.get(labels_key)
                if value_labels is None:
                    continue
                if column.measure_type is MeasureType.CONTINUOUS:
                    column.change(measure_type=MeasureType.NOMINAL)
                levels = column.levels
                for index, value_and_label in enumerate(levels):
                    new_label = value_labels.get(value_and_label[0])
                    if new_label is not None:
                        levels[index] = (value_and_label[0], new_label, new_label)
                column.change(levels=levels)

    def handle_metadata(self, metadata):
        if metadata.row_count >= 0:  # negative values are possible here!
            self._data.set_row_count(metadata.row_count)

    def handle_value_label(self, labels_key, value, label):
        if labels_key not in self._tmp_value_labels:
            labels = OrderedDict()
            self._tmp_value_labels[labels_key] = labels
        else:
            labels = self._tmp_value_labels[labels_key]
        labels[value] = label

    def handle_variable(self, index, variable, labels_key):
        name = variable.name
        label = variable.label

        column = self._data.append_column(name, name)
        if label is not None:
            column.description = label

        # this should be multiplied by 8, but we use larger fonts,
        # so i'm opting for 12
        width = variable.display_width * 12

        if width == 0:
            width = 100
        elif width < 32:
            width = 32
        column.width = width

        if labels_key in self._tmp_value_labels:
            # level labels are already available
            level_labels = self._tmp_value_labels.get(labels_key)
        else:
            level_labels = None
            # save the column to have labels added later
            self._columns_by_labels_key[labels_key] = column

        column.column_type = ColumnType.DATA

        var_meas = variable.measure
        var_type = variable.type

        if level_labels and var_meas == Measure.SCALE:
            # if scale w/ levels, treat it as ordinal
            # https://github.com/jamovi/jamovi/issues/487
            var_meas = Measure.ORDINAL

        if var_meas == Measure.SCALE:
            measure_type = MeasureType.CONTINUOUS
        elif var_meas == Measure.ORDINAL:
            measure_type = MeasureType.ORDINAL
        else:
            measure_type = MeasureType.NOMINAL

        if var_type is str:
            if measure_type == MeasureType.CONTINUOUS:
                measure_type = MeasureType.NOMINAL

            column.set_data_type(DataType.TEXT)
            column.set_measure_type(measure_type)

            if level_labels is not None:
                level_i = 0
                for value in level_labels:
                    label = level_labels[value]
                    column.append_level(level_i, label, value)
                    level_i += 1

        elif var_type is date:

            column.set_data_type(DataType.INTEGER)
            column.set_measure_type(MeasureType.ORDINAL)

        elif var_type is int or var_type is float:
            if var_meas is Measure.NOMINAL or var_meas is Measure.ORDINAL or level_labels:

                if var_meas == Measure.NOMINAL:
                    measure_type = MeasureType.NOMINAL
                else:
                    measure_type = MeasureType.ORDINAL

                column.set_data_type(DataType.INTEGER)
                column.set_measure_type(measure_type)

                if level_labels is not None:

                    too_wide = False
                    if level_labels is not None:
                        for value in level_labels:
                            if int(value).bit_length() > 32:
                                too_wide = True
                                break

                    if too_wide:
                        column.set_data_type(DataType.TEXT)
                        n = 0
                        for value in level_labels:
                            label = level_labels[value]
                            column.append_level(n, label, str(value))
                            n += 1

                    elif var_type is float:
                        new_labels = OrderedDict()
                        for value in level_labels:
                            label = level_labels[value]
                            new_labels[int(value)] = label
                        level_labels = new_labels

                        for value in level_labels:
                            label = level_labels[value]
                            column.append_level(value, label, str(value))

                    else:
                        for value in level_labels:
                            label = level_labels[value]
                            column.append_level(value, label, str(value))
            else:
                if var_type is float:
                    data_type = DataType.DECIMAL
                else:
                    data_type = DataType.INTEGER

                column.set_data_type(data_type)
                column.set_measure_type(MeasureType.CONTINUOUS)

        missings = [ ]

        for low, high in variable.missing_ranges:
            if isinstance(low, str):
                low = "'{}'".format(low)
            if isinstance(high, str):
                high = "'{}'".format(high)

            if low == high:
                missings.append('== {}'.format(low))
            elif isinstance(low, Number):  # if it's a range
                # ranges are weird, and we don't understand why people would
                # want to use them. we also don't support them, so this is us
                # trying to figure out what is intended by the ranges
                if column.data_type == DataType.INTEGER:
                    high = int(high)
                    low = int(low)
                    n_levels = abs(high - low)
                    if n_levels > 12:
                        # then only treat the value closer to zero as relevant
                        if abs(high) < abs(low):
                            missings.append('<= {}'.format(high))
                        else:
                            missings.append('>= {}'.format(low))
                    else:
                        # if the no. levels is low, then make lots of equals
                        for i in range(low, high + 1):
                            missings.append('== {}'.format(i))
                else:
                    # treat the value closer to zero as relevant
                    if abs(high) < abs(low):
                        missings.append('<= {}'.format(high))
                    else:
                        missings.append('>= {}'.format(low))
            else:
                # shouldn't get here
                missings.append('== {}'.format(low))
                missings.append('== {}'.format(high))

        if missings:
            column.set_missing_values(missings)

    def handle_value(self, var_index, row_index, value):

        if row_index >= self._data.row_count:
            self._data.set_row_count(row_index + 1)
        else:
            if var_index == 0 and row_index % 100 == 0:
                self._prog_cb(row_index / self._data.row_count)

        self._max_row_index = max(self._max_row_index, row_index)

        vt = type(value)

        column = self._data[var_index]

        if column.data_type is DataType.TEXT:
            if value is not None:
                if vt is not str:
                    value = str(value)
                if column.has_levels:
                    if not column.has_level(value):
                        column.append_level(
                            column.level_count,
                            value,
                            value)
                    if column.level_count > 50:
                        column.change(measure_type=MeasureType.ID)
                column.set_value(row_index, value)
            else:
                column.set_value(row_index, '')
        elif (column.measure_type is MeasureType.NOMINAL
                or column.measure_type is MeasureType.ORDINAL):
            if isinstance(value, Number):
                if not math.isclose(float(value) % 1.0, 0.0):
                    column.change(data_type=DataType.DECIMAL)
                    self.handle_value(var_index, row_index, value)
                    return

                try:
                    value = int(value)
                    if value.bit_length() > 32:
                        raise Exception()
                except Exception:
                    column.change(
                        data_type=DataType.DECIMAL,
                        measure_type=MeasureType.CONTINUOUS)
                column.set_value(row_index, value)
            elif vt is date:
                delta = value - TIME_START
                ul_value = delta.days
                if not column.has_level(ul_value):
                    column.insert_level(ul_value, value.isoformat(), str(ul_value))
                column.set_value(row_index, ul_value)
            else:
                column.set_value(row_index, -2147483648)
        elif column.data_type is DataType.DECIMAL:
            if isinstance(value, Number):
                column.set_value(row_index, float(value))
            else:
                column.set_value(row_index, float('nan'))
        elif column.data_type is DataType.INTEGER:
            if isinstance(value, Number):
                column.set_value(row_index, int(value))
            else:
                column.set_value(row_index, -2147483648)


def write(data, path, prog_cb, format):
    writer = Writer()
    writer.open(path, format)
    writer.set_file_label('jamovi data set')

    def fix_name(name):
        name = name.replace(' ', '_')
        return name

    columns = filter(lambda col: not col.is_virtual, data)
    column_names = map(lambda col: col.name, columns)
    column_names = map(fix_name, column_names)
    column_names = list(column_names)

    for col_no, column in enumerate(data):
        if column.is_virtual:
            break

        if column.data_type is DataType.TEXT:
            data_type = str
            storage_width = 0
            if column.has_levels:
                for level in column.levels:
                    storage_width = max(storage_width, len(level[1].encode('utf-8')))
            else:
                for value in column:
                    storage_width = max(storage_width, len(value.encode('utf-8')))
        elif column.data_type is DataType.DECIMAL:
            data_type = float
            storage_width = 8
        else:
            data_type = int
            storage_width = 4

        if column.measure_type is MeasureType.NOMINAL:
            measure_type = Measure.NOMINAL
        elif column.measure_type is MeasureType.ORDINAL:
            measure_type = Measure.ORDINAL
        elif column.measure_type is MeasureType.CONTINUOUS:
            measure_type = Measure.SCALE
        else:
            measure_type = Measure.UNKNOWN

        name = column_names[col_no]

        var = writer.add_variable(
            name,
            data_type,
            storage_width)

        var.measure = measure_type

        if column.has_levels:
            if column.data_type is DataType.INTEGER:
                levels = map(lambda x: (x[0], x[1]), column.levels)
            else:
                levels = map(lambda x: (x[2], x[1]), column.levels)
            writer.add_value_labels(var, data_type, levels)

    writer.set_row_count(data.row_count)

    for row_no in range(data.row_count):
        for col_no in range(data.column_count):
            value = data[col_no][row_no]
            writer.insert_value(row_no, col_no, value)

    writer.close()
