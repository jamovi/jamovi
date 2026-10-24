"""Storage: where an instance's data sets live, and which engines read them.

The storage type is chosen with the 'storage' setting (or the
JAMOVI_STORAGE environment variable); 'shmem' or 'duckdb'. It defaults to
'shmem' when the (compiled) core is available, and 'duckdb' otherwise.
"""

from __future__ import annotations

import importlib
import posixpath
from functools import cache

from .dataset import DataSet
from .dataset import Store
from .dataset import StoreFactory
from .utils import conf


STORAGE_TYPES = ('shmem', 'duckdb')


@cache
def core_available() -> bool:
    """Whether the (compiled) core, required by shmem, is available"""
    try:
        core = importlib.import_module('jamovi.core')
    except ImportError:
        return False
    # without the compiled module, jamovi/core (its sources) imports as an
    # empty namespace package
    return hasattr(core, 'MemoryMap')


def storage_type() -> str:
    """The configured storage type"""
    s_type = conf.get('storage', 'shmem' if core_available() else 'duckdb')
    if s_type not in STORAGE_TYPES:
        raise ValueError(f"Unrecognised storage type '{ s_type }'")
    if s_type == 'shmem' and not core_available():
        raise RuntimeError("shmem storage requires the (compiled) core; use duckdb storage instead")
    return s_type


def engine_type() -> str:
    """The engine manager type which reads the configured storage"""
    # the engine manager types share their names with the storage types
    return storage_type()


def create_storage(instance_path: str) -> Storage:
    """Create the storage for an instance"""
    s_type = storage_type()
    if s_type == 'duckdb':
        return DuckStorage(instance_path)
    return ShMemStorage(instance_path)


class Storage:
    """The data sets of an instance"""

    def create_dataset(self, dataset_id: int) -> DataSet:
        raise NotImplementedError

    def remove_dataset(self, dataset_id: int) -> None:
        raise NotImplementedError

    def close(self) -> None:
        raise NotImplementedError


class ShMemStorage(Storage):
    """Each data set lives in its own shared memory segment"""

    _instance_path: str
    _stores: dict[int, Store]

    def __init__(self, instance_path: str):
        self._instance_path = instance_path
        self._stores = { }

    def _segment_path(self, dataset_id: int) -> str:
        # the engine expects to find the data set at {instance}/buffer.
        # when the engine is passed the data set id, this can become
        # buffer-{ dataset_id }
        return posixpath.join(self._instance_path, 'buffer')

    def create_dataset(self, dataset_id: int) -> DataSet:
        store = StoreFactory.create(self._segment_path(dataset_id), 'shmem')
        self._stores[dataset_id] = store
        return store.create_dataset()

    def remove_dataset(self, dataset_id: int) -> None:
        store = self._stores.pop(dataset_id, None)
        if store is not None:
            store.close()

    def close(self) -> None:
        for store in self._stores.values():
            store.close()
        self._stores = { }


class DuckStorage(Storage):
    """All the data sets live in the one duckdb database"""

    def __init__(self, instance_path: str):
        # the engine expects to find the database at {instance}/buffer
        path = posixpath.join(instance_path, 'buffer')
        self._store = StoreFactory.create(path, 'duckdb')

    def create_dataset(self, dataset_id: int) -> DataSet:
        return self._store.create_dataset(dataset_id)

    def remove_dataset(self, dataset_id: int) -> None:
        self._store.remove_dataset(dataset_id)

    def close(self) -> None:
        self._store.close()
