from __future__ import annotations

from typing import Iterator
import itertools

from duckdb import connect
from duckdb import DuckDBPyConnection

from .store import Store
from .duckdataset import DuckDataSet


class _Fetched:
    """the rows of a query, fetched before its connection was closed"""

    def __init__(self, rows: list[tuple]):
        self._rows = rows

    def fetchall(self) -> list[tuple]:
        return self._rows


class DuckStore(Store):
    """a store for data sets based on a duckdb database

    a store can contain many data sets, each with their own tables. the
    data sets attach to the store independently, and the database is only
    connected to while at least one of them is attached (the engines can't
    read the database while the server holds a read/write connection)"""

    _db: DuckDBPyConnection | None
    _n_attached: int
    _n_writers: int
    _ids: Iterator[int]

    @staticmethod
    def create(path: str) -> DuckStore:
        """create a new duckdb database to use as a store"""
        return DuckStore(path)

    def __init__(self, path: str):
        self._path = path
        self._db = None
        self._n_attached = 0
        self._n_writers = 0
        self._ids = iter(itertools.count(1))

    def _next_id(self) -> int:
        return next(self._ids)

    def attach(self, read_only: bool = False):
        """attach to the database to make changes"""
        self._n_attached += 1
        if not read_only:
            self._n_writers += 1
            if self._db is not None and self._n_writers == 1:
                # connected read only, reconnect read/write
                self._db.close()
                self._db = None
        # we don't actually connect to the db until we need to

    def detach(self, read_only: bool = False):
        """detach from the database (and flush to disk once all are detached)"""
        if self._n_attached == 0:
            raise ValueError("Store not attached")
        self._n_attached -= 1
        if not read_only:
            self._n_writers -= 1
        if self._n_attached == 0 and self._db is not None:
            self._db.close()
            self._db = None

    def create_dataset(self, dataset_id: int | None = None) -> "DuckDataSet":
        if dataset_id is None:
            dataset_id = self._next_id()
        return DuckDataSet.create(self, dataset_id)

    def retrieve_dataset(self) -> "DuckDataSet":
        raise NotImplementedError

    def remove_dataset(self, dataset_id: int) -> None:
        """drop the tables of a data set"""
        self.attach()
        try:
            for table in ("meta", "columns", "data", "levels"):
                self.execute(f'DROP TABLE IF EXISTS "sheet_{ table }_{ dataset_id }"')
        finally:
            self.detach()

    def execute(
        self, query: object, params: object = None
    ):
        """execute SQL in the duckdb database"""
        if self._n_attached == 0:
            # reads are allowed without attaching (as for the shared memory
            # store), with a connection for just this query
            with connect(self._path, read_only=True) as db:
                result = db.execute(query, params)
                # fetch everything before the connection closes
                return _Fetched(result.fetchall())
        if self._db is None:
            self._db = connect(self._path, read_only=(self._n_writers == 0))
        return self._db.execute(query, params)

    def close(self) -> None:
        if self._db is not None:
            self._db.close()
            self._db = None
