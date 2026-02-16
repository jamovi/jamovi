
from pathlib import Path
import itertools
import typing

import pytest

from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType
from jamovi.server.dataset import Column
from jamovi.server.dataset import CellValue
from jamovi.server.instancemodel import InstanceModel
from jamovi.server.formatio.readstat import read


def resolve_path(filename: str) -> str:
    """resolve the path to a test resource"""
    here_dir = Path(__file__).parent
    return str(here_dir / "data" / filename)


def assert_levels_equal(a, b) -> None:
    assert len(a) == len(b), "length mismatch"
    for i, (x, y) in enumerate(zip(a, b)):
        assert x[:4] == y[:4], f"index {i}: {x!r} != {y!r}"


def assert_cell_equal(a, b):
    if isinstance(b, float):
        assert a == pytest.approx(b)
    else:
        assert a == b


def assert_column_equals(
        column: Column,
        *,
        data_type: DataType | None = None,
        measure_type: MeasureType | None = None,
        expected_values: typing.Iterable[CellValue] | None = None,
        levels: typing.Iterable[tuple] | None = None,
        missing_values: typing.Iterable[str] | None = None,
):

    if column.data_type is not None:
        assert column.data_type is data_type

    if column.measure_type is not None:
        assert column.measure_type is measure_type

    if levels is not None:
        assert_levels_equal(column.levels, levels)

    if missing_values is not None:
        assert column.missing_values == missing_values

    if expected_values is not None:
        obs_values = column.get_values(0, 1000)
        for o, e in zip(obs_values, expected_values):
            assert_cell_equal(o, e)


@pytest.mark.parametrize(
    (
        "column_name",
        "data_type",
        "measure_type",
        "levels",
        "missing_values",
        "expected_gen",
    ),
    (
        (
            "int_col",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            ["== -99", "== -100", "== -101"],
            lambda i: i + 1,
        ),
        (
            "int_col_2",
            DataType.INTEGER,
            MeasureType.ORDINAL,
            (
                (2, "small", "2", True),
                (3, "medium", "3", True),
                (4, "large", "4", True),
                (5, "xlarge", "5", True),
            ),
            ["<= -99"],
            lambda i: i % 4 + 2,
        ),
        (
            "dbl_col",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            [],
            lambda i: i / 10.0 + 0.1,
        ),
        (
            "chr_col",
            DataType.TEXT,
            MeasureType.ID,
            [],
            [],
            lambda i: f"item_{i+1:04d}",
        ),
        (
            "date_col",
            DataType.INTEGER,
            MeasureType.ORDINAL,
            None,
            [],
            lambda i: i + 18262,
        ),
        (
            "logical_col",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            [],
            lambda i: i % 2,
        ),
        (
            "factor_col",
            DataType.TEXT,
            MeasureType.NOMINAL,
            [
                (0, "Aardvark", "A", True),
                (1, "Baboon", "B", True),
                (2, "Cat", "C", True),
                (3, "Dog", "D", True),
                (4, "E", "E", False),
            ],
            [],
            lambda i: ("Aardvark", "Baboon", "E", "")[i % 4],
        ),
    ),
)
def test_read_sav(instance_model: InstanceModel,
                  column_name: str,
                  data_type: DataType,
                  measure_type: MeasureType,
                  levels: typing.Iterable[tuple] | None,
                  missing_values: typing.Iterable[str] | None,
                  expected_gen: typing.Callable[[int], CellValue]):
    """test read_sav()"""

    # GIVEN an empty instance model
    # WHEN reading in a .sav file
    data_path = resolve_path("multi.sav")
    read(instance_model, data_path, lambda x: None, format="sav")

    # THEN the columns, etc. come through correctly
    column = instance_model[column_name]
    expected_values = map(expected_gen, itertools.count())
    assert_column_equals(column,
                         data_type=data_type,
                         measure_type=measure_type,
                         levels=levels,
                         missing_values=missing_values,
                         expected_values=expected_values)
