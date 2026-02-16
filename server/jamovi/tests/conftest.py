"""Pytest fixtures to use in the tests."""

from os import path
from tempfile import TemporaryDirectory
from uuid import uuid4
import math

from typing import Iterator

import pytest
import pytest_asyncio

from jamovi.server.dataset import StoreFactory
from jamovi.server.dataset import Store
from jamovi.server.dataset import DataSet
from jamovi.server.dataset import Column

from jamovi.server.instancemodel import InstanceModel
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
def empty_dataset(shared_memory_store: Store) -> Iterator[DataSet]:
    dataset = shared_memory_store.create_dataset()
    dataset.attach()
    yield dataset
    dataset.detach()


@pytest.fixture
def empty_column(empty_dataset: DataSet) -> Column:
    return empty_dataset.append_column("fred")


@pytest.fixture
def simple_dataset(empty_dataset: DataSet) -> DataSet:
    ds = empty_dataset
    ds.append_column("fred")
    ds.append_column("jim")
    ds.append_column("bob")
    return ds


@pytest.fixture(scope='module')
def session(temp_dir: str) -> Session:
    return Session(temp_dir, str(uuid4()))


@pytest_asyncio.fixture
async def instance(session: Session) -> Instance:
    return await session.create()


@pytest.fixture
def instance_model(instance: Instance, empty_dataset) -> InstanceModel:
    im = InstanceModel(instance)
    im._dataset = empty_dataset
    return im

