"""Pytest fixtures to use in the tests."""

from os import path
from tempfile import TemporaryDirectory

import pytest

from jamovi.server import dataset


@pytest.fixture
def temp_dir() -> str:
    with TemporaryDirectory() as temp:
        yield temp


@pytest.fixture
def shared_memory_store(temp_dir: str) -> dataset.Store:
    temp_file = path.join(temp_dir, "fred.mm")
    store = dataset.StoreFactory.create(temp_file, "shmem")
    yield store
    store.close()


@pytest.fixture
def duckdb_store(temp_dir: str) -> dataset.Store:
    temp_file = path.join(temp_dir, "fred.duckdb")
    store = dataset.StoreFactory.create(temp_file, "duckdb")
    yield store
    store.close()


@pytest.fixture
def empty_dataset(shared_memory_store: dataset.Store) -> dataset.DataSet:
    return shared_memory_store.create_dataset()


@pytest.fixture
def empty_column(empty_dataset: dataset.DataSet) -> dataset.Column:
    return empty_dataset.append_column("fred")
