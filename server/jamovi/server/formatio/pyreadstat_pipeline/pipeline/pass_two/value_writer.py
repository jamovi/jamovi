from typing import Protocol

import polars as pl

from jamovi.server.instancemodel import InstanceModel


class ValueWriter(Protocol):
    """Storage-target adapter for writing normalized chunk values."""

    def write_values(self, column_refs: list[int] | list[str], row_offset: int, values: list[pl.Series]) -> None:
        """Write one chunk payload to the target storage backend."""


class InstanceModelValueWriter:
    """Value writer backed by InstanceModel shared-memory APIs."""

    def __init__(self, model: InstanceModel):
        self._model = model

    def write_values(self, column_refs: list[int] | list[str], row_offset: int, values: list[pl.Series]) -> None:
        """Write values, preferring initing path when available."""
        try:
            self._model.set_values_initing(column_refs, row_offset, values)
        except AttributeError:
            self._model.set_values(column_refs, row_offset, values)
