"""Tests for the dataset class."""

from typing import Sequence
from typing import TypeAlias
from typing import Any
from uuid import uuid4
import math

import pytest

from jamovi.server.dataset import DataSet
from jamovi.server.dataset.duckdataset import DuckDataSet
from jamovi.server.dataset.duckcolumn import DuckColumn
from jamovi.server.dataset.duckcolumn import DuckLevel
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType


NAN = float("nan")
NAN_INT = -2147483648

CellValue: TypeAlias = str | int | float


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


def test_row_modification(simple_dataset: DataSet):
    """test modification of row count"""
    simple_dataset.set_row_count(33)
    assert simple_dataset.row_count == 33


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


@pytest.mark.parametrize(
    ("measure_type", "values", "expected_levels"),
    [
        (
            MeasureType.NOMINAL,
            ["fred", "44", "jim", "33.1", "", "33.1", "fred"],
            [
                {
                    "value": 0,
                    "label": "fred",
                    "import_value": "fred",
                    "pinned": False,
                    "count": 2,
                    "count_ex_filtered": 2,
                },
                {
                    "value": 1,
                    "label": "44",
                    "import_value": "44",
                    "pinned": False,
                    "count": 1,
                    "count_ex_filtered": 1,
                },
                {
                    "value": 2,
                    "label": "jim",
                    "import_value": "jim",
                    "pinned": False,
                    "count": 1,
                    "count_ex_filtered": 1,
                },
                {
                    "value": 3,
                    "label": "33.1",
                    "import_value": "33.1",
                    "pinned": False,
                    "count": 2,
                    "count_ex_filtered": 2,
                },
            ],
        ),
        (
            MeasureType.NOMINAL,
            [500, 2000, NAN_INT, 500],
            [
                {
                    "value": 500,
                    "label": "500",
                    "import_value": "500",
                    "pinned": False,
                    "count": 2,
                    "count_ex_filtered": 2,
                },
                {
                    "value": 2000,
                    "label": "2000",
                    "import_value": "2000",
                    "pinned": False,
                    "count": 1,
                    "count_ex_filtered": 1,
                },
            ],
        ),
    ],
)
def test_level_count_updating(
    empty_dataset: DuckDataSet,
    measure_type: MeasureType,
    values: Sequence[int | float | str],
    expected_levels: Sequence[dict[str, Any]],
):
    """test that level counts are updated accordingly"""
    ds = empty_dataset
    ds.set_row_count(len(values))

    # GIVEN a populated column
    column = add_column_to_dataset(ds, measure_type, values)

    for index, value in enumerate(values):
        assert equals(column.get_value(index), value)

    levels_must_equal(column.dlevels, expected_levels)


@pytest.mark.parametrize(
    ("measure_type", "values", "edits", "expected_levels"),
    [
        (
            MeasureType.NOMINAL,
            ["fred", "44", "jim", "33.1", "", "33.1", "fred"],
            [NAN_INT, NAN_INT, 2, None, None, None, None],
            [
                {
                    "value": 0,
                    "label": "fred",
                    "import_value": "fred",
                    "pinned": False,
                    "count": 1,
                    "count_ex_filtered": 1,
                },
                {
                    "value": 1,
                    "label": "33.1",
                    "import_value": "33.1",
                    "pinned": False,
                    "count": 3,
                    "count_ex_filtered": 3,
                },
            ],
        ),
        (
            MeasureType.NOMINAL,
            [2000, 500, 500, 500, 1000, 1000, 2000, NAN_INT, 500],
            [None, 500, 2000, NAN_INT, 2000, NAN_INT, NAN_INT, 500, 500],
            [
                {
                    "value": 500,
                    "label": "500",
                    "import_value": "500",
                    "pinned": False,
                    "count": 3,
                    "count_ex_filtered": 3,
                },
                {
                    "value": 2000,
                    "label": "2000",
                    "import_value": "2000",
                    "pinned": False,
                    "count": 3,
                    "count_ex_filtered": 3,
                },
            ],
        ),
    ],
)
def test_levels_are_trimmed_when_counts_reach_zero(
    empty_dataset: DuckDataSet,
    measure_type: MeasureType,
    values: Sequence[int | str],
    edits: Sequence[int | str | None],
    expected_levels: Sequence[dict[str, Any]],
):
    """test that levels are trimmed accordingly"""
    ds = empty_dataset
    ds.set_row_count(len(values))

    # GIVEN a populated column
    column = add_column_to_dataset(ds, measure_type, values)

    for index, value in enumerate(edits):
        if value is not None:
            column.set_value(index, value)

    levels_must_equal(column.dlevels, expected_levels)


@pytest.mark.skip(reason="TODO")
@pytest.mark.parametrize(
    ("values_before", "values_after", "dps"),
    [
        (["123.12", "fred"], [123.12, NAN], 2),
        (["123", "456"], [123, 456], 0),
        (["123.2", "456,1"], [123.2, NAN], 1),  # euro float
        # (["123", "456,1"], [123, 456.1], 1),  # TODO
    ],
)
def test_column_text_to_decimal(
    empty_dataset: DataSet,
    values_before: list[str],
    values_after: list[float],
    dps: int,
):
    """Text -> Decimal transitions correctly"""
    ds = empty_dataset
    ds.set_row_count(5)

    # GIVEN a column of text data type
    column = ds.append_column("fred")
    column.set_data_type(DataType.TEXT)
    for i, v in enumerate(values_before):
        column.insert_level(i, v)
        column.set_value(i, i)

    # WHEN i change its data type to decimal
    column.change(data_type=DataType.DECIMAL)

    # THEN the values are converted appropriately
    for i, v in enumerate(values_after):
        v2 = column.get_value(i)
        if not math.isnan(v):
            assert v2 == pytest.approx(v)
        else:
            assert math.isnan(v2)

    # AND dps is updated accordingly
    # assert column.dps == dps


@pytest.mark.parametrize(
    ("data_type", "values_expected"),
    [
        (DataType.INTEGER, [123, NAN_INT, NAN_INT]),
        (DataType.DECIMAL, [123.12, NAN, NAN]),
    ],
)
def test_column_data_types(
    empty_dataset: DataSet,
    data_type: DataType,
    values_expected: list[str | float | int],
):
    """Check columns return values of appropriate type"""
    ds = empty_dataset
    ds.set_row_count(5)

    # GIVEN a column of text data type
    column = ds.append_column("fred")
    column.change(data_type=data_type, measure_type=MeasureType.CONTINUOUS)
    for i, v in enumerate(values_expected):
        column.set_value(i, v)
        v2 = column.get_value(i)
        assert equals(v, v2)
