"""Tests for the dataset class."""

from typing import TypeAlias

import pytest

from jamovi.server import dataset

ColumnProperty: TypeAlias = bool | str | int | dataset.ColumnType | dataset.MeasureType


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
