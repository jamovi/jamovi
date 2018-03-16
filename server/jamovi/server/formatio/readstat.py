
from collections import OrderedDict
from numbers import Number

from jamovi.core import ColumnType
from jamovi.core import MeasureType

from jamovi.readstat import Parser as ReadStatParser
from jamovi.readstat import Measure


def get_readers():
    return [
        ( 'sav', lambda data, path: read(data, path, 'sav') ),
        ( 'dta', lambda data, path: read(data, path, 'dta') ),
        ( 'por', lambda data, path: read(data, path, 'por') ),
        ( 'xpt', lambda data, path: read(data, path, 'xpt') ),
        ( 'sas7bdat', lambda data, path: read(data, path, 'sas7bdat') ) ]


def read(data, path, format):
    parser = Parser(data)
    parser.parse(path, format)
    for column in data.dataset:
        column.determine_dps()


class Parser(ReadStatParser):

    def __init__(self, data):

        self._data = data

        self._tmp_value_labels = { }

        self._metadata = None
        self._labels = [ ]

    def handle_metadata(self, metadata):
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
        if label is None:
            label = name
        column = self._data.dataset.append_column(label, name)
        level_labels = self._tmp_value_labels.get(labels_key)

        column.column_type = ColumnType.DATA

        var_meas = variable.measure
        var_type = variable.type
        if var_type is str:
            column.set_measure_type(MeasureType.NOMINAL_TEXT)
            if level_labels is not None:
                level_i = 0
                for value in level_labels:
                    label = level_labels[value]
                    column.append_level(level_i, label, value)
                    level_i += 1
        elif var_type is int or var_type is float:
            if var_meas is Measure.NOMINAL or var_meas is Measure.ORDINAL:
                mt = MeasureType.NOMINAL if var_meas is Measure.NOMINAL else MeasureType.ORDINAL
                column.set_measure_type(mt)
                if level_labels is not None:
                    new_labels = OrderedDict()
                    if var_type is float:
                        for value in level_labels:
                            label = level_labels[value]
                            new_labels[int(value)] = label
                        level_labels = new_labels
                    for value in level_labels:
                        label = level_labels[value]
                        column.append_level(value, label, str(value))
            else:
                column.set_measure_type(MeasureType.CONTINUOUS)

    def handle_value(self, var_index, row_index, value):

        vt = type(value)

        column = self._data.dataset[var_index]

        if column.measure_type is MeasureType.NOMINAL_TEXT:
            if vt is str:
                if not column.has_level(value):
                    column.append_level(column.level_count, value, value)
                column.set_value(row_index, value)
            elif value is None:
                column.set_value(row_index, value)
        elif column.measure_type is MeasureType.CONTINUOUS:
            if isinstance(value, Number):
                column.set_value(row_index, float(value))
            elif value is None:
                column.set_value(row_index, float('nan'))
        elif (column.measure_type is MeasureType.NOMINAL or
                column.measure_type is MeasureType.ORDINAL):
            if isinstance(value, Number):
                column.set_value(row_index, int(value))
            elif value is None:
                column.set_value(row_index, -2147483648)
