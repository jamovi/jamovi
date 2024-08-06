from typing import Sequence
from typing import TypeAlias
from typing import Iterable

from importlib import resources

import csv
import math
from uuid import uuid4
import itertools

import pytest

from jamovi.server.dataset.dataset import DataSet
from jamovi.server.dataset.duckdataset import DuckDataSet
from jamovi.server.dataset.duckcolumn import DuckColumn
from jamovi.server.dataset.duckcolumn import DuckLevel
from jamovi.server.dataset.duckcolumn import Level
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType


CellValue: TypeAlias = str | int | float

NAN = float("nan")
NAN_INT = -2147483648


def equals(x: CellValue, y: CellValue) -> bool:
    """test if two cell values are equal"""
    if isinstance(x, float) and isinstance(y, float):
        if math.isnan(x):
            return math.isnan(y)
        if math.isnan(y):
            return False
        return pytest.approx(x) == y
    else:
        return x == y


def load(dataset: DataSet, reader: Iterable[Iterable[str]]) -> None:
    """load data into a dataset"""
    skip_1st = itertools.islice(reader, 1, None)
    for row_no, row in enumerate(skip_1st):
        if row_no >= dataset.row_count:
            dataset.set_row_count(row_no + 1)
        for col_no, value in enumerate(row):
            column = dataset[col_no]
            if column.data_type is DataType.DECIMAL:
                value = float(value)
            elif column.data_type is DataType.INTEGER:
                value = int(value)
            elif column.has_levels and column.data_type is DataType.TEXT:
                value = column.get_value_for_label(value)
            column.set_value(row_no, value, True)


def level_must_equal(level: DuckLevel, values: dict):
    """tests whether a level has certain values"""
    for name, value in values.items():
        assert getattr(level, name) == value


def levels_must_equal(levels: Sequence[DuckLevel], values: Sequence[dict]):
    """tests whether levels have certain values"""
    assert len(levels) == len(values)
    for i, level in enumerate(levels):
        level_must_equal(level, values[i])


def add_column_to_dataset(
    dataset: DuckDataSet, measure_type: MeasureType, values: Sequence[int | float | str]
) -> DuckColumn:
    """Add a column to a dataset and populate it"""
    column = dataset.append_column(str(uuid4()))
    if isinstance(values[0], str) and measure_type in (
        MeasureType.NOMINAL,
        MeasureType.ORDINAL,
    ):
        column.change(data_type=DataType.TEXT, measure_type=measure_type)
        for index, value in enumerate(values):
            if not isinstance(value, str):
                raise TypeError
            try:
                if value == "":
                    raw_value = NAN_INT
                else:
                    raw_value = column.get_value_for_label(value)
            except KeyError:
                raw_value = column.level_count
                column.append_level(raw_value, value, value, False)
            column.set_value(index, raw_value, initing=True)
    elif isinstance(values[0], int) and measure_type in (
        MeasureType.NOMINAL,
        MeasureType.ORDINAL,
    ):
        column.change(data_type=DataType.INTEGER, measure_type=measure_type)
        for index, value in enumerate(values):
            if not isinstance(value, int):
                raise TypeError
            if value != NAN_INT and not column.has_level(value):
                column.insert_level(value, str(value))
            column.set_value(index, value, initing=True)
    else:
        data_type = {
            str: DataType.TEXT,
            int: DataType.INTEGER,
            float: DataType.DECIMAL,
        }[type(values[0])]
        column.change(data_type=data_type, measure_type=measure_type)
        for index, value in enumerate(values):
            column.set_value(index, value)
    return column

def alter_levels(levels: Iterable[Level], changes: dict[int, dict]) -> Iterable[Level]:
    """Alter levels"""
    new_levels = [ ]
    for level in levels:
        value, label, import_value, pinned = level
        level_changes = changes.get(value, {})
        for k, v in level_changes.items():
            if k == 'label':
                label = v
            elif k == 'import_value':
                import_value = v
            elif k == 'pinned':
                pinned = v
            else:
                raise ValueError
        new_levels.append((value, label, import_value, pinned))
    return new_levels
