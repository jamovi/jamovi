"""Tests for the dataset class."""

from typing import TypeAlias
import math

import pytest

from jamovi.server.dataset import DataSet
from jamovi.server.dataset import DataType


NAN = float("nan")
NAN_INT = -2147483648

CellValue: TypeAlias = str | int | float | None


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
    simple_dataset.set_row_count(1537)
    assert simple_dataset.row_count == 1537


def test_text(empty_dataset):
    """test that text values are persisted accordingly"""
    ds = empty_dataset
    ds.set_row_count(5)

    # GIVEN a column of text data type
    column = ds.append_column("fred")
    column.set_data_type(DataType.TEXT)

    # WHEN setting values
    column.set_value(0, "fred")
    column.set_value(1, "44")
    column.set_value(2, "jim")
    column.set_value(3, "33.1")

    # THEN these are persisted
    assert column.get_value(0) == "fred"
    assert column.get_value(1) == "44"
    assert column.get_value(2) == "jim"
    assert column.get_value(3) == "33.1"


@pytest.mark.parametrize(
    ("values_before", "values_after", "dps"),
    [
        (["123.12", "fred"], [123.12, NAN], 2),
        (["123", "456"], [123, 456], 0),
        (["123.2", "456,1"], [123.2, NAN], 1),  # euro float
        (["123", "456,1"], [123, 456.1], 1),
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
        column.set_value(i, v)

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
    assert column.dps == dps


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
    values_expected: list[str | float | int | None],
):
    """Check columns return values of appropriate type"""
    ds = empty_dataset
    ds.set_row_count(5)

    # GIVEN a column of text data type
    column = ds.append_column("fred")
    column.set_data_type(data_type)
    for i, v in enumerate(values_expected):
        column.set_value(i, v)
        v2 = column.get_value(i)
        assert equals(v, v2)


def test_set_values(empty_dataset: DataSet):
    """test set_values()"""
    ds = empty_dataset

    # GIVEN a dataset with two columns, 5 rows
    column_fred = ds.append_column("fred")
    column_fred.set_data_type(DataType.TEXT)

    column_jim = ds.append_column("jim")
    column_jim.set_data_type(DataType.INTEGER)

    ds.set_row_count(5)

    # WHEN applying values with set_values
    values = [
        ["x", "y", "z"],
        [1, 2, 3],
    ]

    ds.set_values(("fred", "jim"), 0, values)

    # THEN the values are applied accordingly
    for column_index, expected_column_values in enumerate(values):
        for row_index, expected_value in enumerate(expected_column_values):
            obs_value = ds[column_index].get_value(row_index)
            assert equals(obs_value, expected_value)
