"""Tests for pyreadstat pipeline level building behavior."""

from types import SimpleNamespace

from jamovi.server.dataset import DataType
from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_one_finalize.build_levels import (
    _resolve_final_level_values,
    calculate_column_levels_payload,
)
from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_one_finalize.level_labels_strategy import LevelLabelPlan


def _make_column(*, data_type, declared_levels, observed_values, missing_values=None):
    missing_values = set(missing_values or [])

    state = SimpleNamespace(
        declared_levels=declared_levels,
        observed_values=observed_values,
        observed_distinct_value_chunks=[],
        is_missing_level_value=lambda value: value in missing_values,
    )
    return SimpleNamespace(
        name="col",
        data_type=data_type,
        state=state,
    )


def test_resolve_final_levels_non_text_prefers_declared_and_ignores_observed():
    """Numeric categorical columns should keep declared levels only."""
    column = _make_column(
        data_type=DataType.INTEGER,
        declared_levels={1: "One", 2: "Two", 99: "Missing"},
        observed_values={1, 2, 3, 99},
        missing_values={99},
    )
    plan = LevelLabelPlan(
        needs_levels=True,
        level_encoding="integer",
        preserve_order=False,
    )

    levels = _resolve_final_level_values(column, plan)

    assert levels == [1, 2]


def test_resolve_final_levels_text_unions_declared_and_observed_with_filters():
    """Text columns include observed values and skip empty/None/missing values."""
    column = _make_column(
        data_type=DataType.TEXT,
        declared_levels={"A": "Alpha", "": "Empty"},
        observed_values={"", "A", "B", "M", None},
        missing_values={"M"},
    )
    plan = LevelLabelPlan(
        needs_levels=True,
        level_encoding="text",
        preserve_order=False,
    )

    levels = _resolve_final_level_values(column, plan)

    assert levels == ["A", "B"]


def test_resolve_final_levels_sorts_observed_when_order_not_preserved():
    """Observed fallback should be sorted when preserve_order is False."""
    column = _make_column(
        data_type=DataType.TEXT,
        declared_levels=None,
        observed_values={3, 1, 2},
    )
    plan = LevelLabelPlan(
        needs_levels=True,
        level_encoding="text",
        preserve_order=False,
    )

    levels = _resolve_final_level_values(column, plan)

    assert levels == [1, 2, 3]


def test_calculate_column_levels_payload_text_creates_code_map_and_integer_codes():
    """Text levels should build a value->code map and integer level codes payload."""
    state = SimpleNamespace(
        declared_levels={"B": "Bee"},
        observed_values={"A", "B"},
        observed_distinct_value_chunks=[],
        is_missing_level_value=lambda _value: False,
        raw_value_to_code_map=None,
        final_level_codes=None,
    )
    column = SimpleNamespace(
        name="col",
        data_type=DataType.TEXT,
        state=state,
    )
    plan = LevelLabelPlan(
        needs_levels=True,
        level_encoding="integer",
        preserve_order=False,
    )

    final_level_codes, raw_value_to_code_map = calculate_column_levels_payload(column, plan)

    assert raw_value_to_code_map == {"B": 0, "A": 1}
    assert final_level_codes == [0, 1]


def test_calculate_column_levels_payload_text_excludes_missing_values_from_codes():
    """Missing values should be excluded from both raw_value_to_code_map and final_level_codes."""
    state = SimpleNamespace(
        declared_levels=None,
        observed_values={"A", "B", "M"},
        observed_distinct_value_chunks=[],
        is_missing_level_value=lambda value: value == "M",
        raw_value_to_code_map=None,
        final_level_codes=None,
    )
    column = SimpleNamespace(
        name="col",
        data_type=DataType.TEXT,
        state=state,
    )
    plan = LevelLabelPlan(
        needs_levels=True,
        level_encoding="integer",
        preserve_order=False,
    )

    final_level_codes, raw_value_to_code_map = calculate_column_levels_payload(column, plan)

    assert "M" not in raw_value_to_code_map
    assert set(raw_value_to_code_map.values()) == {0, 1}
    assert set(final_level_codes) == {0, 1}
