from typing import TypeAlias
from uuid import uuid4

import pytest

from jamovi.server.dataset.duckcolumn import DuckColumn
from jamovi.server.dataset import Column
from jamovi.server.dataset import DataSet
from jamovi.server.dataset import ColumnType
from jamovi.server.dataset import MeasureType
from jamovi.server.dataset import DataType

from .utils import assert_levels_must_equal


ColumnProperty: TypeAlias = bool | str | int | ColumnType | MeasureType


@pytest.mark.parametrize(
    ("before", "change", "expected"),
    [
        (
            (DataType.TEXT, MeasureType.NOMINAL),
            (DataType.DECIMAL, MeasureType.NOMINAL),
            (DataType.DECIMAL, MeasureType.CONTINUOUS),
        ),
        (
            (DataType.DECIMAL, MeasureType.CONTINUOUS),
            (DataType.DECIMAL, MeasureType.ORDINAL),
            (DataType.TEXT, MeasureType.ORDINAL),
        ),
        (
            (DataType.TEXT, MeasureType.ID),
            (DataType.TEXT, MeasureType.NOMINAL),
            (DataType.TEXT, MeasureType.NOMINAL),
        ),
    ],
)
def test_column_data_types_changes(
    empty_column: DuckColumn,
    before: tuple[DataType, MeasureType],
    change: tuple[DataType, MeasureType],
    expected: tuple[DataType, MeasureType],
):
    """test if column data and measure types change accordingly"""
    column = empty_column
    column.set_data_type(before[0])
    column.set_measure_type(before[1])

    assert column.data_type == before[0]
    assert column.measure_type == before[1]

    column.change(data_type=change[0], measure_type=change[1])

    assert column.data_type == expected[0]
    assert column.measure_type == expected[1]


@pytest.mark.parametrize(
    ("property_name", "value"),
    [
        ("auto_measure", True),
        ("auto_measure", False),
        ("column_type", ColumnType.DATA),
        ("column_type", ColumnType.COMPUTED),
        ("description", "the fish was delish äüïöëÿ"),
        ("formula", "6 + 2 - 3"),
        ("formula_message", "your formula is bad"),
        ("id", 7),
        ("import_name", "bruce äüïöëÿ"),
        ("measure_type", MeasureType.CONTINUOUS),
        ("name", "fred äüïöëÿ"),
    ],
)
def test_columns_persist_properties(
    empty_column: Column,
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
    ("index",),
    [
        (0,),
        (1,),
        (2,),
        (3,),
    ],
)
def test_column_insertion(
    simple_dataset: DataSet,
    index: int,
):
    """Test column insertions"""
    # GIVEN a simple dataset with 3 columns, a name, and an index
    new_name = str(uuid4())

    # WHEN inserting new columns
    column_names = list(map(lambda x: x.name, simple_dataset))
    simple_dataset.insert_column(index, new_name)

    # THEN the column names after are what they should be
    column_names_after = list(map(lambda x: x.name, simple_dataset))
    column_names.insert(index, new_name)
    assert column_names == column_names_after


@pytest.mark.parametrize(
    ("index",),
    [
        (0,),
        (1,),
        (2,),
    ],
)
def test_column_deletion(
    simple_dataset: DataSet,
    index: int,
):
    """Test column deletions"""
    # GIVEN a simple dataset with 3 columns and an index

    # WHEN deleting a column
    column_names = list(map(lambda x: x.name, simple_dataset))
    simple_dataset.delete_columns(index, index)

    # THEN the column names after are what they should be
    column_names_after = list(map(lambda x: x.name, simple_dataset))
    del column_names[index]
    assert column_names == column_names_after


def test_insert_levels(empty_column: DuckColumn):
    "test level insertion"
    column = empty_column
    column.set_data_type(DataType.TEXT)
    column.set_measure_type(MeasureType.NOMINAL)
    column.insert_level(55, "VC")
    column.insert_level(77, "OJ")

    assert_levels_must_equal(
        column.dlevels,
        [{"value": 0, "import_value": "OJ"}, {"value": 1, "import_value": "VC"}],
    )
