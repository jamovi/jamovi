"""Tests for the dataset class."""

from typing import TypeAlias

import pytest

from jamovi.server import dataset

ColumnProperty: TypeAlias = bool | str | int | dataset.ColumnType | dataset.MeasureType

NAN = float("nan")
NAN_INT = -2147483648

CellValue: TypeAlias = str | int | float | None

def equals(x: CellValue, y: CellValue) -> bool:
    '''returns if two cell values are equal'''
    if isinstance(x, float) and isinstance(y, float):
        if math.isnan(x):
            return math.isnan(y)
        if math.isnan(y):
            return False
        return pytest.approx(x) == y
    else:
        return x == y



@pytest.mark.parametrize(
    ("property_name", "value"),
    [
        ("auto_measure", True),
        ("auto_measure", False),
        ("column_type", dataset.ColumnType.DATA),
        ("column_type", dataset.ColumnType.COMPUTED),
        ("description", "the fish was delish äüïöëÿ"),
        ("formula", "6 + 2 - 3"),
        ("formula_message", "your formula is bad"),
        ("id", 7),
        ("import_name", "bruce äüïöëÿ"),
        ("measure_type", dataset.MeasureType.CONTINUOUS),
        ("name", "fred äüïöëÿ"),
    ],
)
def test_columns_persist_properties(
    empty_column: dataset.Column,
    property_name: str,
    value: ColumnProperty,
):
    """Column properties are persisted."""
    # GIVEN a column
    column = empty_column

    # WHEN i change its property values
    setattr(column, property_name, value)

    # THEN the property values are persisted
    assert getattr(column, property_name) == value


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
    empty_dataset: dataset.DataSet,
    values_before: list[str],
    values_after: list[float],
    dps: int,
):
    """Text -> Decimal transitions correctly"""
    ds = empty_dataset
    ds.set_row_count(5)

    # GIVEN a column of text data type
    column = ds.append_column("fred")
    column.set_data_type(dataset.DataType.TEXT)
    for i, v in enumerate(values_before):
        column.set_value(i, v)

    # WHEN i change its data type to decimal
    column.change(data_type=dataset.DataType.DECIMAL)

    # THEN the values are converted appropriately
    for i, v in enumerate(values_after):
        v2 = column.get_value(i)
        if math.isnan(v):
            assert math.isnan(v2)
        else:
            assert v2 == pytest.approx(v)

    # AND dps is updated accordingly
    assert column.dps == pytest.approx(dps)

@pytest.mark.parametrize(
    ("data_type", "values_expected"),
    [
        (dataset.DataType.INTEGER, [ 123, NAN_INT, NAN_INT ]),
        (dataset.DataType.DECIMAL, [ 123.12, NAN, NAN ]),
        (dataset.DataType.TEXT,    [ "123", "fred", None ]),
    ],
)
def test_column_data_types(
    empty_dataset: dataset.DataSet,
    data_type: dataset.DataType,
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
