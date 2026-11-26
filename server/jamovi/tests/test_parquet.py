"""Tests for the parquet importer"""

from datetime import date
from datetime import datetime
from datetime import time
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
import typing

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from jamovi.server import formatio
from jamovi.server.dataset import CellValue
from jamovi.server.dataset import Column
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType
from jamovi.server.datasetmodel import DataSetModel
from jamovi.server.formatio import parquet
from jamovi.server.formatio.exceptions import FileCorruptError
from jamovi.server.formatio.parquet import read

from .conftest import equals


N = 60  # rows; 50 or more unique values isn't nominal
NA = -2147483648
DAY_2024 = 19723  # 2024-01-01 as days since 1970-01-01
JAN_1 = datetime(2024, 1, 1)


def categories(values, indices, ordered=False):
    return pa.DictionaryArray.from_arrays(
        pa.array(indices, pa.int32()),
        pa.array(values),
        ordered=ordered)


def every(n, i):
    """missing in every nth row"""
    return i % n == n - 1


COLUMNS: dict[str, pa.Array] = {
    "int_nominal": pa.array(
        [None if every(10, i) else i % 3 for i in range(N)], pa.int8()),
    "int_continuous": pa.array(range(N), pa.int64()),
    "int_too_wide": pa.array([i * 10**10 for i in range(N)], pa.int64()),
    "int_too_wide_for_float": pa.array(
        [2**64 - 1 if i == 0 else i for i in range(N)], pa.uint64()),
    "uint": pa.array([i % 4 for i in range(N)], pa.uint32()),
    "double": pa.array(
        [None if every(10, i) else i / 4 for i in range(N)], pa.float64()),
    "float": pa.array([i + 0.5 for i in range(N)], pa.float32()),
    "decimal": pa.array([Decimal(i) / 100 for i in range(N)], pa.decimal128(6, 2)),
    "duration": pa.array([i * 500 for i in range(N)], pa.duration("ms")),
    "duration_ns": pa.array(
        [None if every(10, i) else i * 10**9 + 1 for i in range(N)],
        pa.duration("ns")),
    "bool": pa.array([(True, False, None)[i % 3] for i in range(N)]),
    "text_nominal": pa.array([("b", "a", " c ", "", None)[i % 5] for i in range(N)]),
    "text_id": pa.array([None if i == 5 else f"id{i:02d}" for i in range(N)]),
    "category": categories(
        ["low", "mid", "high", "unused"],
        [None if every(10, i) else i % 3 for i in range(N)]),
    "category_ordered": categories(
        ["small", "large"], [i % 2 for i in range(N)], ordered=True),
    "category_int": categories([10, 5, 20], [i % 3 for i in range(N)]),
    "date": pa.array([date(2024, 1, 1) + timedelta(days=i) for i in range(N)]),
    "date64": pa.array(
        [date(2024, 1, 1) + timedelta(days=i % 2) for i in range(N)], pa.date64()),
    "timestamp_midnight": pa.array(
        [JAN_1 + timedelta(days=i % 3) for i in range(N)], pa.timestamp("ns")),
    "timestamp": pa.array(
        [JAN_1 + timedelta(minutes=90 * (i % 2)) for i in range(N)],
        pa.timestamp("s")),
    "timestamp_many": pa.array(
        [JAN_1 + timedelta(hours=i, milliseconds=500) for i in range(N)],
        pa.timestamp("ms")),
    "timestamp_tz": pa.array(
        [JAN_1 + timedelta(hours=i % 2) for i in range(N)],
        pa.timestamp("us", tz="+05:30")),
    "time": pa.array([time(12, 0, i % 2) for i in range(N)], pa.time64("us")),
    "list": pa.array([[i % 2] for i in range(N)], pa.list_(pa.int64())),
    "struct": pa.array([{"x": i % 2, "y": "z"} for i in range(N)]),
    "binary": pa.array([(b"abc", b"def")[i % 2] for i in range(N)], pa.binary()),
    "binary_not_utf8": pa.array([b"\xff" for i in range(N)], pa.binary()),
    "fixed_binary": pa.array([bytes([0, i % 2]) for i in range(N)], pa.binary(2)),
    "null": pa.nulls(N),
}


@pytest.fixture
def parquet_path(tmp_path: Path) -> str:
    path = str(tmp_path / "types.parquet")
    pq.write_table(pa.table(COLUMNS), path)
    return path


def assert_column_equals(
        column: Column,
        *,
        data_type: DataType,
        measure_type: MeasureType,
        levels: typing.Iterable[tuple] | None = None,
        expected_values: list[CellValue] | None = None):

    assert column.data_type is data_type
    assert column.measure_type is measure_type

    if levels is not None:
        assert [level[:4] for level in column.levels] == list(levels)

    if expected_values is not None:
        values = column.get_values(0, column.row_count)
        assert len(values) == len(expected_values)
        for i, (obs, exp) in enumerate(zip(values, expected_values)):
            assert equals(obs, exp), f"row {i}: {obs!r} != {exp!r}"


@pytest.mark.parametrize(
    ("column_name", "data_type", "measure_type", "levels", "expected_gen"),
    (
        (
            "int_nominal",
            DataType.INTEGER,
            MeasureType.NOMINAL,
            [(0, "0", "0", False), (1, "1", "1", False), (2, "2", "2", False)],
            lambda i: NA if every(10, i) else i % 3,
        ),
        (
            "int_continuous",
            DataType.INTEGER,
            MeasureType.CONTINUOUS,
            [],
            lambda i: i,
        ),
        (
            "int_too_wide",  # doesn't fit in 32 bits
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            lambda i: float(i * 10**10),
        ),
        (
            "int_too_wide_for_float",  # 2**64 - 1 is rounded
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            lambda i: float(2**64 - 1) if i == 0 else float(i),
        ),
        (
            "uint",
            DataType.INTEGER,
            MeasureType.NOMINAL,
            [(v, str(v), str(v), False) for v in range(4)],
            lambda i: i % 4,
        ),
        (
            "double",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            lambda i: float("nan") if every(10, i) else i / 4,
        ),
        (
            "float",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            lambda i: i + 0.5,
        ),
        (
            "decimal",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            lambda i: i / 100,
        ),
        (
            "duration",  # in seconds
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            lambda i: i / 2,
        ),
        (
            "duration_ns",
            DataType.DECIMAL,
            MeasureType.CONTINUOUS,
            [],
            lambda i: float("nan") if every(10, i) else i + 1e-9,
        ),
        (
            "bool",
            DataType.INTEGER,
            MeasureType.NOMINAL,
            [(0, "FALSE", "0", False), (1, "TRUE", "1", False)],
            lambda i: (1, 0, NA)[i % 3],
        ),
        (
            "text_nominal",  # trimmed, and empty strings are missing
            DataType.TEXT,
            MeasureType.NOMINAL,
            [(0, "a", "a", False), (1, "b", "b", False), (2, "c", "c", False)],
            lambda i: ("b", "a", "c", "", "")[i % 5],
        ),
        (
            "text_id",
            DataType.TEXT,
            MeasureType.ID,
            [],
            lambda i: "" if i == 5 else f"id{i:02d}",
        ),
        (
            "category",  # levels in the file's order, including unused ones
            DataType.TEXT,
            MeasureType.NOMINAL,
            [
                (0, "low", "low", True),
                (1, "mid", "mid", True),
                (2, "high", "high", True),
                (3, "unused", "unused", True),
            ],
            lambda i: "" if every(10, i) else ("low", "mid", "high")[i % 3],
        ),
        (
            "category_ordered",
            DataType.TEXT,
            MeasureType.ORDINAL,
            [(0, "small", "small", True), (1, "large", "large", True)],
            lambda i: ("small", "large")[i % 2],
        ),
        (
            "category_int",  # pyarrow reads these back as plain integers
            DataType.INTEGER,
            MeasureType.NOMINAL,
            [(5, "5", "5", False), (10, "10", "10", False), (20, "20", "20", False)],
            lambda i: (10, 5, 20)[i % 3],
        ),
        (
            "date",  # days since 1970-01-01, as in readstat.py
            DataType.INTEGER,
            MeasureType.ORDINAL,
            [
                (DAY_2024 + i, (date(2024, 1, 1) + timedelta(days=i)).isoformat(),
                 str(DAY_2024 + i), False)
                for i in range(N)
            ],
            lambda i: DAY_2024 + i,
        ),
        (
            "date64",
            DataType.INTEGER,
            MeasureType.ORDINAL,
            [
                (DAY_2024, "2024-01-01", str(DAY_2024), False),
                (DAY_2024 + 1, "2024-01-02", str(DAY_2024 + 1), False),
            ],
            lambda i: DAY_2024 + i % 2,
        ),
        (
            "timestamp_midnight",  # i.e. dates from pandas
            DataType.INTEGER,
            MeasureType.ORDINAL,
            [
                (DAY_2024 + i, f"2024-01-0{i + 1}", str(DAY_2024 + i), False)
                for i in range(3)
            ],
            lambda i: DAY_2024 + i % 3,
        ),
        (
            "timestamp",
            DataType.TEXT,
            MeasureType.NOMINAL,
            [
                (0, "2024-01-01 00:00:00", "2024-01-01 00:00:00", False),
                (1, "2024-01-01 01:30:00", "2024-01-01 01:30:00", False),
            ],
            lambda i: ("2024-01-01 00:00:00", "2024-01-01 01:30:00")[i % 2],
        ),
        (
            "timestamp_many",
            DataType.TEXT,
            MeasureType.ID,
            [],
            lambda i: str(JAN_1 + timedelta(hours=i, milliseconds=500)),
        ),
        (
            "timestamp_tz",
            DataType.TEXT,
            MeasureType.NOMINAL,
            None,
            lambda i: (
                "2024-01-01 05:30:00+05:30",
                "2024-01-01 06:30:00+05:30")[i % 2],
        ),
        (
            "time",
            DataType.TEXT,
            MeasureType.NOMINAL,
            None,
            lambda i: ("12:00:00", "12:00:01")[i % 2],
        ),
        (
            "list",  # as in jsonlines.py, json
            DataType.TEXT,
            MeasureType.NOMINAL,
            None,
            lambda i: ("[0]", "[1]")[i % 2],
        ),
        (
            "struct",
            DataType.TEXT,
            MeasureType.NOMINAL,
            None,
            lambda i: ('{"x": 0, "y": "z"}', '{"x": 1, "y": "z"}')[i % 2],
        ),
        (
            "binary",
            DataType.TEXT,
            MeasureType.NOMINAL,
            None,
            lambda i: ("abc", "def")[i % 2],
        ),
        (
            "binary_not_utf8",
            DataType.TEXT,
            MeasureType.NOMINAL,
            [(0, "�", "�", False)],
            lambda i: "�",
        ),
        (
            "fixed_binary",  # i.e. uuids, as hex
            DataType.TEXT,
            MeasureType.NOMINAL,
            None,
            lambda i: ("0000", "0001")[i % 2],
        ),
        (
            "null",
            DataType.INTEGER,
            MeasureType.NOMINAL,
            [],
            lambda i: NA,
        ),
    ),
)
def test_read_parquet(
        dataset_model: DataSetModel,
        parquet_path: str,
        column_name: str,
        data_type: DataType,
        measure_type: MeasureType,
        levels: typing.Iterable[tuple] | None,
        expected_gen: typing.Callable[[int], CellValue]):
    """each arrow type is mapped onto a jamovi data and measure type"""

    # GIVEN a .parquet file with a column of each type
    # WHEN reading it in
    read(dataset_model, parquet_path, lambda x: None)

    # THEN the columns, levels and values come through correctly
    assert dataset_model.row_count == N
    assert dataset_model.column_count == len(COLUMNS)
    column = dataset_model[column_name]
    assert_column_equals(column,
                         data_type=data_type,
                         measure_type=measure_type,
                         levels=levels,
                         expected_values=[expected_gen(i) for i in range(N)])


def test_read_parquet_dps(dataset_model: DataSetModel, parquet_path: str):
    """decimal places are determined for decimal columns"""
    read(dataset_model, parquet_path, lambda x: None)
    assert dataset_model["double"].dps == 2
    assert dataset_model["decimal"].dps == 2
    assert dataset_model["float"].dps == 1


def test_read_parquet_in_batches(
        dataset_model: DataSetModel,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch):
    """columns are examined across all the batches, and categories can
    differ between row groups"""

    # GIVEN a file with several row groups, read in several batches
    monkeypatch.setattr(parquet, "BATCH_SIZE", 7)
    table = pa.table({
        # 50 unique values, but fewer than that in any one batch
        "int": pa.array([i % 50 for i in range(N)], pa.int32()),
        "text": pa.array([f"{i % 50:02d}" for i in range(N)]),
        "category": pa.chunked_array([
            categories(["b", "a"], [i % 2 for i in range(30)]),
            categories(["c", "a"], [i % 2 for i in range(30)]),
        ]),
        # the second row group has a value which doesn't fit in 32 bits
        "int_too_wide": pa.array([i if i < 30 else 10**10 for i in range(N)]),
    })
    path = str(tmp_path / "batches.parquet")
    pq.write_table(table, path, row_group_size=30)

    # WHEN reading it in
    progress: list[float] = []
    read(dataset_model, path, progress.append)

    # THEN it is as though it were read all at once
    assert dataset_model.row_count == N
    assert_column_equals(
        dataset_model["int"],
        data_type=DataType.INTEGER,
        measure_type=MeasureType.CONTINUOUS,
        expected_values=[i % 50 for i in range(N)])
    assert_column_equals(
        dataset_model["text"],
        data_type=DataType.TEXT,
        measure_type=MeasureType.ID,
        expected_values=[f"{i % 50:02d}" for i in range(N)])
    assert_column_equals(
        dataset_model["category"],
        data_type=DataType.TEXT,
        measure_type=MeasureType.NOMINAL,
        levels=[(0, "b", "b", True), (1, "a", "a", True), (2, "c", "c", True)],
        expected_values=[("b", "a")[i % 2] for i in range(30)]
        + [("c", "a")[i % 2] for i in range(30)])
    assert_column_equals(
        dataset_model["int_too_wide"],
        data_type=DataType.DECIMAL,
        measure_type=MeasureType.CONTINUOUS,
        expected_values=[float(i if i < 30 else 10**10) for i in range(N)])

    # AND progress goes from 0 to 1
    assert progress == sorted(progress)
    assert progress[-1] == pytest.approx(1.0, abs=1e-4)


def test_read_parquet_empty(dataset_model: DataSetModel, tmp_path: Path):
    """a file without rows still has its columns"""

    # GIVEN a .parquet file without rows
    path = str(tmp_path / "empty.parquet")
    table = pa.table({
        "int": pa.array([], pa.int64()),
        "double": pa.array([], pa.float64()),
        "text": pa.array([], pa.string()),
        "date": pa.array([], pa.date32()),
    })
    pq.write_table(table, path)

    # WHEN reading it in
    read(dataset_model, path, lambda x: None)

    # THEN the columns are there, with no rows
    assert dataset_model.row_count == 0
    assert [column.name for column in dataset_model][:4] == [
        "int", "double", "text", "date"]
    assert dataset_model["int"].data_type is DataType.INTEGER
    assert dataset_model["double"].data_type is DataType.DECIMAL
    assert dataset_model["text"].data_type is DataType.TEXT
    assert dataset_model["date"].measure_type is MeasureType.ORDINAL


def test_read_parquet_no_columns(dataset_model: DataSetModel, tmp_path: Path):
    """as with other formats, a file without columns gets a column 'A'"""
    path = str(tmp_path / "nothing.parquet")
    pq.write_table(pa.table({}), path)
    read(dataset_model, path, lambda x: None)
    assert dataset_model.column_count == 1
    assert dataset_model[0].name == "A"
    assert dataset_model.row_count == 0


def test_read_parquet_corrupt(dataset_model: DataSetModel, tmp_path: Path):
    """a file which isn't parquet is reported as corrupt"""
    path = tmp_path / "not.parquet"
    path.write_text("a,b\n1,2\n")
    with pytest.raises(FileCorruptError):
        read(dataset_model, str(path), lambda x: None)


def test_read_dataset(dataset_model: DataSetModel, tmp_path: Path):
    """through formatio, column names are fixed up as for other formats"""
    path = str(tmp_path / "names.parquet")
    pq.write_table(pa.table({".x": [1, 2], "": ["a", "b"]}), path)
    formatio.read_dataset(dataset_model, path, lambda x: None, {})
    assert [column.name for column in dataset_model if not column.is_virtual] == [
        "_x", "B"]


def test_parquet_is_registered():
    """.parquet files are recognised, and read with the settings argument"""
    assert formatio.is_supported("data.parquet")
    assert formatio.is_supported("DATA.PARQUET")
    assert formatio.readers["parquet"][1] is read
