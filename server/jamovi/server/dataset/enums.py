"""The column/data/measure types

These don't require the (compiled) core, which uses these same enums. The
values match those in common/vartypes.h and common/column.h.
"""

from enum import Enum


class DataType(Enum):
    INTEGER = 1
    DECIMAL = 2
    TEXT    = 3
    NONE    = 0

    @staticmethod
    def stringify(data_type):
        if data_type == DataType.INTEGER:
            return 'Integer'
        elif data_type == DataType.DECIMAL:
            return 'Decimal'
        elif data_type == DataType.TEXT:
            return 'Text'
        else:
            return 'Integer'

    @staticmethod
    def parse(data_type):
        if data_type == 'Integer':
            return DataType.INTEGER
        elif data_type == 'Decimal':
            return DataType.DECIMAL
        elif data_type == 'Text':
            return DataType.TEXT
        else:
            return DataType.INTEGER


class MeasureType(Enum):
    NONE         = 0
    NOMINAL      = 2
    ORDINAL      = 3
    CONTINUOUS   = 4
    ID           = 5

    @staticmethod
    def stringify(measure_type):
        if measure_type == MeasureType.CONTINUOUS:
            return 'Continuous'
        elif measure_type == MeasureType.ORDINAL:
            return 'Ordinal'
        elif measure_type == MeasureType.NOMINAL:
            return 'Nominal'
        elif measure_type == MeasureType.ID:
            return 'ID'
        else:
            return 'None'

    @staticmethod
    def parse(measure_type):
        if measure_type == 'Continuous':
            return MeasureType.CONTINUOUS
        elif measure_type == 'Ordinal':
            return MeasureType.ORDINAL
        elif measure_type == 'Nominal':
            return MeasureType.NOMINAL
        elif measure_type == 'ID':
            return MeasureType.ID
        elif measure_type == 'None':
            return MeasureType.NONE
        else:
            return MeasureType.CONTINUOUS


class ColumnType(Enum):
    NONE     = 0
    DATA     = 1
    COMPUTED = 2
    RECODED  = 3
    FILTER   = 4
    OUTPUT   = 5

    @staticmethod
    def stringify(value):
        if value == ColumnType.DATA:
            return 'Data'
        elif value == ColumnType.COMPUTED:
            return 'Computed'
        elif value == ColumnType.RECODED:
            return 'Recoded'
        elif value == ColumnType.FILTER:
            return 'Filter'
        elif value == ColumnType.OUTPUT:
            return 'Output'
        elif value == ColumnType.NONE:
            return 'None'
        else:
            return 'Data'

    @staticmethod
    def parse(value):
        if value == 'Data':
            return ColumnType.DATA
        elif value == 'Computed':
            return ColumnType.COMPUTED
        elif value == 'Recoded':
            return ColumnType.RECODED
        elif value == 'Filter':
            return ColumnType.FILTER
        elif value == 'Output':
            return ColumnType.OUTPUT
        elif value == 'None':
            return ColumnType.NONE
        else:
            return ColumnType.DATA
