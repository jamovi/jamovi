"""Tests for the dataset class."""

from typing import Sequence
from typing import TypeAlias
from typing import Any
import math
import itertools

import pytest

from jamovi.server.dataset import DataSet
from jamovi.server.dataset.duckdataset import DuckDataSet
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType

from .utils import equals
from .utils import levels_must_equal
from .utils import add_column_to_dataset
from .utils import alter_levels


NAN = float("nan")
NAN_INT = -2147483648

CellValue: TypeAlias = str | int | float


def test_row_modification(simple_dataset: DataSet):
    """test modification of row count"""
    simple_dataset.set_row_count(33)
    assert simple_dataset.row_count == 33


@pytest.mark.parametrize(
    ("column_name",),
    (("len",), ("dose",), ("supp",)),
)
def test_clear(toothgrowth_dataset: DuckDataSet, column_name: str):
    """test column clear"""
    ds = toothgrowth_dataset
    column = ds[column_name]
    column.clear()
    for value in column:
        if column.data_type is DataType.DECIMAL:
            assert isinstance(value, float)
            assert math.isnan(value)
        elif column.data_type is DataType.TEXT:
            assert value == ""
        else:
            assert value == NAN_INT

    levels_must_equal(column.dlevels, [])


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


def test_set_levels_int(toothgrowth_dataset: DuckDataSet):
    """test set levels"""
    dataset = toothgrowth_dataset

    dlevels = [
        {
            "value": 2000,
            "label": "2000",
            "import_value": "2000",
            "pinned": False,
            "count": 20,
            "count_ex_filtered": 20,
        },
        {
            "value": 500,
            "label": "500",
            "import_value": "500",
            "pinned": False,
            "count": 20,
            "count_ex_filtered": 20,
        },
        {
            "value": 77,
            "label": "lert",
            "import_value": "lert",
            "pinned": True,
            "count": 0,
            "count_ex_filtered": 0,
        },
        {
            "value": 1000,
            "label": "1000",
            "import_value": "1000",
            "pinned": False,
            "count": 20,
            "count_ex_filtered": 20,
        },
        {
            "value": 10000,
            "label": "10000",
            "import_value": "10000",
            "pinned": True,
            "count": 0,
            "count_ex_filtered": 0,
        },
    ]

    levels = [
        (lvl["value"], lvl["label"], lvl["import_value"], lvl["pinned"])
        for lvl in dlevels
    ]

    column = dataset["dose"]
    column.set_levels(levels)

    levels_must_equal(column.dlevels, dlevels)


def test_set_levels_int_unpin(toothgrowth_dataset: DuckDataSet):
    """test set levels"""
    dataset = toothgrowth_dataset

    dose = dataset["dose"]

    # pin the 1000 level
    levels = alter_levels(dose.levels, {1000: {"pinned": True}})
    dose.set_levels(levels)

    for index in itertools.chain(range(0, 20), range(30, 50)):
        # clear out the 500s and 1000s
        dose.set_value(index, NAN_INT)

    levels_must_equal(
        dose.dlevels,
        [
            {
                "value": 1000,
                "pinned": True,
                "count": 0,
            },
            {
                "value": 2000,
                "pinned": False,
                "count": 20,
            },
        ],
    )

    # unpin the 1000 level
    levels = alter_levels(dose.levels, {1000: {"pinned": False}})
    dose.set_levels(levels)

    levels_must_equal(
        dose.dlevels,
        [
            {
                "value": 2000,
            },
        ],
    )
