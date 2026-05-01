"""Tests for pyreadstat pipeline level writing."""

from types import SimpleNamespace
from unittest.mock import Mock, call

import polars as pl
from jamovi.core import MeasureType
from jamovi.server.dataset import DataType
from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import ColumnFinalPlan, SemanticColumnKind, SourceFormatType

from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_two.write_chunk_levels import write_chunk_levels


def _plan(*, final_level_codes, raw_value_to_code_map, declared_levels) -> ColumnFinalPlan:
    return ColumnFinalPlan(
        name="x",
        index=0,
        source_format=SourceFormatType.UNKNOWN,
        semantic_kind=SemanticColumnKind.NOMINAL_CODED,
        data_type=DataType.INTEGER,
        measure_type=MeasureType.NOMINAL,
        missing_values=[],
        declared_levels=declared_levels,
        final_level_codes=final_level_codes,
        raw_value_to_code_map=raw_value_to_code_map,
        final_polars_dtype=pl.Int32,
        preserve_temporal_numeric=False,
        fill_null_value=None,
    )


def test_write_chunk_levels_uses_declared_labels_and_pinning():
    """Declared level labels should be preferred, including string/number key matches."""
    column = SimpleNamespace(
        name="x",
        append_level=Mock(),
    )
    plan = _plan(
        final_level_codes=[1, 2],
        raw_value_to_code_map=None,
        declared_levels={"1": "One"},
    )

    write_chunk_levels([column], [plan])

    assert column.append_level.call_count == 2
    assert column.append_level.call_args_list == [
        call(1, "One", "1", pinned=True),
        call(2, "2", "2", pinned=False),
    ]


def test_write_chunk_levels_deduplicates_when_multiple_raw_values_share_code():
    """Only one level append should occur per resolved code."""
    column = SimpleNamespace(
        name="x",
        append_level=Mock(),
    )
    plan = _plan(
        final_level_codes=[10, 11],
        raw_value_to_code_map={10: 0, 11: 0},
        declared_levels={},
    )

    write_chunk_levels([column], [plan])

    column.append_level.assert_called_once_with(0, "10", "10", pinned=False)
