"""Tests for pyreadstat pipeline value writing."""

from unittest.mock import Mock

import polars as pl
from jamovi.core import MeasureType
from jamovi.server.dataset import DataType
from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import ColumnFinalPlan, SemanticColumnKind, SourceFormatType

from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_two.write_model_values import write_chunk_values


def _plan(*, name: str, index: int | None) -> ColumnFinalPlan:
    return ColumnFinalPlan(
        name=name,
        index=index,
        source_format=SourceFormatType.UNKNOWN,
        semantic_kind=SemanticColumnKind.UNKNOWN,
        data_type=DataType.DECIMAL,
        measure_type=MeasureType.CONTINUOUS,
        missing_values=[],
        declared_levels={},
        final_level_codes=None,
        raw_value_to_code_map=None,
        final_polars_dtype=pl.Float64,
        preserve_temporal_numeric=False,
        fill_null_value=None,
    )


def test_write_chunk_values_uses_index_refs_when_available():
    """Chunk writer should pass index refs and Polars Series payloads to the adapter."""
    writer = Mock()

    chunk_df = pl.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})
    plans = [_plan(name="a", index=0), _plan(name="b", index=1)]

    write_chunk_values(writer, plans, chunk_df, row_offset=7)

    writer.write_values.assert_called_once()
    call_args = writer.write_values.call_args[0]
    assert call_args[0] == [0, 1]
    assert call_args[1] == 7
    assert all(isinstance(v, pl.Series) for v in call_args[2])


def test_write_chunk_values_falls_back_to_name_refs_when_index_unavailable():
    """Chunk writer should use column names when index metadata is unavailable."""
    writer = Mock()

    chunk_df = pl.DataFrame({"a": [1.0, 2.0]})
    plans = [_plan(name="a", index=None)]

    write_chunk_values(writer, plans, chunk_df, row_offset=3)

    writer.write_values.assert_called_once()
    call_args = writer.write_values.call_args[0]
    assert call_args[0] == ["a"]
    assert call_args[1] == 3
    assert isinstance(call_args[2][0], pl.Series)
