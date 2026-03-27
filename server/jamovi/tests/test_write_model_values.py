"""Tests for pyreadstat pipeline value writing."""

from types import SimpleNamespace
from unittest.mock import Mock

import polars as pl

from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_two.write_model_values import write_chunk_values


def test_write_chunk_values_uses_index_refs_when_available():
    """Chunk writer should pass index refs and Polars Series payloads to the adapter."""
    writer = Mock()

    chunk_df = pl.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})
    columns = [SimpleNamespace(name="a", index=0), SimpleNamespace(name="b", index=1)]

    write_chunk_values(writer, columns, chunk_df, row_offset=7)

    writer.write_values.assert_called_once()
    call_args = writer.write_values.call_args[0]
    assert call_args[0] == [0, 1]
    assert call_args[1] == 7
    assert all(isinstance(v, pl.Series) for v in call_args[2])


def test_write_chunk_values_falls_back_to_name_refs_when_index_unavailable():
    """Chunk writer should use column names when index metadata is unavailable."""
    writer = Mock()

    chunk_df = pl.DataFrame({"a": [1.0, 2.0]})
    columns = [SimpleNamespace(name="a")]

    write_chunk_values(writer, columns, chunk_df, row_offset=3)

    writer.write_values.assert_called_once()
    call_args = writer.write_values.call_args[0]
    assert call_args[0] == ["a"]
    assert call_args[1] == 3
    assert isinstance(call_args[2][0], pl.Series)
