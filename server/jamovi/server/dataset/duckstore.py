from __future__ import annotations

from typing import Iterator
import itertools

from duckdb import connect
from duckdb import DuckDBPyConnection

from .store import Store
from .duckdataset import DuckDataSet


class DuckStore(Store):
    """a store for data sets based on a duckdb database"""

    _db: DuckDBPyConnection | None
    _attached: bool
    _ids: Iterator[int]

    @staticmethod
    def create(path: str) -> DuckStore:
        """create a new duckdb database to use as a store"""
        return DuckStore(path)

    def __init__(self, path: str):
        self._path = path
        self._db = None
        self._attached = False
        self._attached_read_only = False
        self._ids = iter(itertools.count())

    def _next_id(self) -> int:
        return next(self._ids)

    def attach(self, read_only: bool = False):
        """attach to the database to make changes"""
        if self._attached:
            raise ValueError("Store already attached")
        self._attached = True
        # we don't actually attach to the db until we need to
        self._attached_read_only = read_only

    def detach(self):
        """detach from the database (and flush to disk)"""
        if not self._attached:
            raise ValueError("Store not attached")
        if self._db:
            self._db.close()
            self._db = None
        self._attached = False

    def create_dataset(self) -> "DuckDataSet":
        return DuckDataSet.create(self, self._next_id())

    def retrieve_dataset(self) -> "DuckDataSet":
        raise NotImplementedError

    def execute(
        self, query: object, params: object = None
    ):
        """execute SQL in the duckdb database"""
        if not self._attached:
            raise ValueError("Store not attached")
        if self._db is None:
            self._db = connect(self._path, read_only=self._attached_read_only)
        return self._db.execute(query, params)

    def close(self) -> None:
        pass
