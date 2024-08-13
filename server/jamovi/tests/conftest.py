"""Pytest fixtures to use in the tests."""

import csv
from os import path
from tempfile import TemporaryDirectory
from uuid import uuid4
import math

from importlib import resources

from typing import Iterator

import pytest
import pytest_asyncio

from jamovi.server.dataset import StoreFactory
from jamovi.server.dataset import Store
from jamovi.server.dataset import DataSet
from jamovi.server.dataset import Column
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType

from .utils import load

from jamovi.server.datasetmodel import DataSetModel
from jamovi.server.instance import Instance
from jamovi.server.session import Session

from jamovi.server.dataset import CellValue


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


@pytest.fixture(scope='module')
def temp_dir() -> Iterator[str]:
    with TemporaryDirectory() as temp:
        yield temp


@pytest.fixture
def shared_memory_store(temp_dir: str) -> Iterator[Store]:
    temp_file = path.join(temp_dir, "fred.mm")
    store = StoreFactory.create(temp_file, "shmem")
    yield store
    store.close()


@pytest.fixture
def empty_shmem_dataset(shared_memory_store: Store) -> Iterator[DataSet]:
    dataset = shared_memory_store.create_dataset()
    dataset.attach()
    yield dataset
    dataset.detach()


@pytest.fixture
def duckdb_store(temp_dir: str) -> Iterator[Store]:
    temp_file = path.join(temp_dir, "fred.duckdb")
    store = StoreFactory.create(temp_file, "duckdb")
    yield store
    store.close()


@pytest.fixture
def empty_dataset(duckdb_store: Store) -> Iterator[DataSet]:
    """empty dataset"""
    dataset = duckdb_store.create_dataset()
    dataset.attach()
    yield dataset
    dataset.detach()


@pytest.fixture
def empty_column(empty_dataset: DataSet) -> Column:
    """empty column"""
    return empty_dataset.append_column("fred")


@pytest.fixture
def simple_dataset(empty_dataset: DataSet) -> DataSet:
    """simple data set"""
    ds = empty_dataset
    ds.append_column("fred")
    ds.append_column("jim")
    ds.append_column("bob")
    return ds


@pytest_asyncio.fixture
async def session(temp_dir: str) -> Session:
    # constructed inside the event loop, as the engine manager requires one
    return Session(temp_dir, str(uuid4()))


@pytest_asyncio.fixture
async def instance(session: Session) -> Instance:
    return await session.create()


@pytest.fixture
def dataset_model(empty_dataset) -> DataSetModel:
    model = DataSetModel()
    model.dataset = empty_dataset
    return model


@pytest.fixture
def toothgrowth_dataset(empty_dataset: DataSet) -> DataSet:
    """tooth growth data set"""

    ds = empty_dataset

    column = ds.append_column("len")
    column.set_data_type(DataType.DECIMAL)
    column.set_measure_type(MeasureType.CONTINUOUS)

    column = ds.append_column("supp")
    column.set_data_type(DataType.TEXT)
    column.set_measure_type(MeasureType.NOMINAL)
    column.append_level(0, "OJ")
    column.append_level(1, "VC")

    column = ds.append_column("dose")
    column.set_data_type(DataType.INTEGER)
    column.set_measure_type(MeasureType.ORDINAL)
    column.append_level(500, "500")
    column.append_level(1000, "1000")
    column.append_level(2000, "2000")

    with resources.files("jamovi.tests.data").joinpath(
        "ToothGrowth.csv"
    ).open() as file:
        reader = csv.reader(file)
        load(ds, reader)

    return ds
