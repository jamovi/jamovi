
from __future__ import annotations

from duckdb import connect
from duckdb import DuckDBPyConnection

from .store import Store
from .duckdataset import DuckDataSet


class DuckStore(Store):

    _db: DuckDBPyConnection

    @staticmethod
    def create(path: str) -> DuckStore:
        db = connect(path)
        return DuckStore(db)

    def __init__(self, db: DuckDBPyConnection):
        self._db = db

    def create_dataset(self) -> DuckDataSet:
        return DuckDataSet.create(self._db)

    def retrieve_dataset(self) -> DuckDataSet:
        raise NotImplementedError

    def close(self) -> None:
        self._db.close()
