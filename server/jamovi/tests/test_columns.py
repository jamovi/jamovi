from typing import TypeAlias
from uuid import uuid4

import pytest

from jamovi.server.dataset import Column
from jamovi.server.dataset import DataSet
from jamovi.server.dataset import ColumnType
from jamovi.server.dataset import MeasureType
from jamovi.server.dataset import DataType


ColumnProperty: TypeAlias = bool | str | int | ColumnType | MeasureType


def test_column_data_types(empty_dataset):
    """test if column data types change accordingly"""
    dataset = empty_dataset

    fred = dataset.append_column("fred")
    fred.change(data_type=DataType.INTEGER, measure_type=MeasureType.CONTINUOUS)

    jim = dataset.append_column("jim")
    jim.change(data_type=DataType.TEXT, measure_type=MeasureType.NOMINAL)

    will = dataset.append_column("will")
    will.change(data_type=DataType.INTEGER, measure_type=MeasureType.NOMINAL)

    assert fred.data_type is DataType.INTEGER
    assert jim.data_type is DataType.TEXT
    assert will.data_type is DataType.INTEGER


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
