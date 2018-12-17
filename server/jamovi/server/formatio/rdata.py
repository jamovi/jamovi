
from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType

from jamovi.librdata import Parser as RDataParser
from jamovi.librdata import DataType as RDataType


def get_readers():
    return [ ( 'rds', read ), ( 'rdata', read )  ]


def read(data, path, prog_cb):
    parser = Parser(data, prog_cb)
    parser.parse(path)
    for column in data.dataset:
        column.determine_dps()


class Parser(RDataParser):

    def __init__(self, data, prog_cb):

        self._data = data
        self._prog_cb = prog_cb
        self._levels = [ ]
        self._current = None
        self._column_offset = 0

    def handle_table(self, name):
        self._column_offset += self._data.column_count

    def handle_column(self, name, data_type, data, count):
        if name is None:
            name = ''

        column = self._data.append_column(name, name)
        self._current = column

        column.column_type = ColumnType.DATA
        if data_type == RDataType.NUMERIC:
            column.set_data_type(DataType.DECIMAL)
            column.set_measure_type(MeasureType.CONTINUOUS)
        elif data_type == RDataType.CHARACTER:
            column.set_data_type(DataType.TEXT)
            column.set_measure_type(MeasureType.ID)
        else:
            column.set_data_type(DataType.INTEGER)
            column.set_measure_type(MeasureType.NOMINAL)

        self._data.set_row_count(count)

        if data_type == RDataType.INTEGER:
            for index, level in enumerate(self._levels):
                column.append_level(index + 1, level)
        elif data_type == RDataType.LOGICAL:
            column.append_level(1, 'TRUE')
            column.append_level(0, 'FALSE')

        if data is not None:
            for index, value in enumerate(data):
                column.set_value(index, value)
        else:
            for index in range(count):
                column.set_value(index, '')

        self._levels = [ ]

    def handle_column_name(self, name, index):
        column = self._data[self._column_offset + index]
        self._data.set_column_name(column, name)

    def handle_text_value(self, value, index):
        self._current.set_value(index, value)

    def handle_value_label(self, value, index):
        self._levels.append(value)
