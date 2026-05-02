
from pathlib import Path
import asyncio
import itertools
import typing
from os import path as ospath

import pytest
import time

from rich import inspect

from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType
from jamovi.server.dataset import Column
from jamovi.server.dataset import CellValue
from jamovi.server.dataset import StoreFactory
from jamovi.server.instancemodel import InstanceModel
from jamovi.server.formatio.pyreadstat import read


def resolve_path(filename: str) -> str:
    """resolve the path to a test resource"""
    here_dir = Path(__file__).parent
    return str(here_dir / "data" / filename)


@pytest.fixture(scope='module')
def loaded_multi_sav(temp_dir: str, session) -> InstanceModel:
    """Load multi.sav once for the whole module, shared across all parameterized tests."""
    store = StoreFactory.create(ospath.join(temp_dir, 'multi_sav.mm'), 'shmem')
    dataset = store.create_dataset()
    dataset.attach()

    # session.create() is a coroutine; asyncio.run() is safe here because no
    # event loop is running in a sync module fixture.
    instance = asyncio.run(session.create())
    im = InstanceModel(instance)
    im._dataset = dataset

    start_time = time.perf_counter()
    read(im, resolve_path('multi.sav'), lambda x: None, format='sav')
    print(f"\nread() time: {time.perf_counter() - start_time:.4f}s")
    yield im

    dataset.detach()
    store.close()


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

    print("column:" + column.name)

    if column.data_type is not None:
        assert column.data_type is data_type

    if column.measure_type is not None:
        assert column.measure_type is measure_type

    if levels is not None:
        assert_levels_equal(column.levels, levels)

    if missing_values is not None:
        assert column.missing_values == missing_values

    if expected_values is not None:
        obs_values = column.get_values(0, 100000)
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
        (
            "dec_lbl_col",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            [],
            lambda i: (1.5, 2.5, 3.0)[i % 3],
        ),
    ),
)
def test_read_sav(loaded_multi_sav: InstanceModel,
                  column_name: str,
                  data_type: DataType,
                  measure_type: MeasureType,
                  levels: typing.Iterable[tuple] | None,
                  missing_values: typing.Iterable[str] | None,
                  expected_gen: typing.Callable[[int], CellValue]):
    """test read_sav()"""

    print("COLUMN", column_name, data_type, measure_type, levels, missing_values)

    # GIVEN a pre-loaded instance model (multi.sav loaded once at module scope)
    # WHEN accessing the named column
    column = loaded_multi_sav.get_column_by_name(column_name)
    expected_values = map(expected_gen, itertools.count())

    # THEN the column's type, levels, missing values, and data all match expectations
    assert_column_equals(column,
                         data_type=data_type,
                         measure_type=measure_type,
                         levels=levels,
                         missing_values=missing_values,
                         expected_values=expected_values)


# def test_datetime_col_has_no_generated_levels(loaded_multi_sav: InstanceModel):
#     """DATETIME columns should preserve numeric values without generated level maps."""
#     datetime_column = loaded_multi_sav.get_column_by_name("datetime_col")
#     assert datetime_column.data_type is DataType.INTEGER
#     assert datetime_column.measure_type is MeasureType.CONTINUOUS
#     assert datetime_column.level_count == 0
