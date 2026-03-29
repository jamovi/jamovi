import pytest
from types import SimpleNamespace
from jamovi.server.dataset import DataType

from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_one_finalize.build_levels import (
    build_column_levels,
    _cast_levels_by_encoding,
    _extract_observed_levels,
    _resolve_final_level_values,
    _should_exclude_level_value,
)


def test_cast_levels_by_encoding_reports_column_context_on_failure():
    with pytest.raises(ValueError) as error:
        _cast_levels_by_encoding(["A"], "integer", "factor_col")

    message = str(error.value)
    assert "factor_col" in message
    assert "integer" in message
    assert "'A'" in message


def test_should_exclude_level_value_handles_empty_and_missing_markers():
    column = SimpleNamespace(
        state=SimpleNamespace(
            is_missing_level_value=lambda value: value == "MISSING",
        )
    )

    assert _should_exclude_level_value(column, None) is True
    assert _should_exclude_level_value(column, "") is True
    assert _should_exclude_level_value(column, "MISSING") is True
    assert _should_exclude_level_value(column, "A") is False


def test_extract_observed_levels_sorts_fallback_values_when_order_not_preserved():
    column = SimpleNamespace(
        state=SimpleNamespace(
            observed_distinct_value_chunks=[],
            observed_values={3, 1, 2},
        )
    )
    plan = SimpleNamespace(preserve_order=False)

    levels = _extract_observed_levels(column, plan)

    assert levels == [1, 2, 3]


def test_resolve_final_levels_non_text_uses_declared_levels_only():
    column = SimpleNamespace(
        data_type=DataType.INTEGER,
        state=SimpleNamespace(
            declared_levels={1: "One", 2: "Two"},
            observed_distinct_value_chunks=[],
            observed_values={1, 2, 3},
            is_missing_level_value=lambda _value: False,
        ),
    )
    plan = SimpleNamespace(preserve_order=False)

    levels = _resolve_final_level_values(column, plan)

    assert levels == [1, 2]


def test_resolve_final_levels_text_merges_declared_and_observed():
    column = SimpleNamespace(
        data_type=DataType.TEXT,
        state=SimpleNamespace(
            declared_levels={"A": "Alpha"},
            observed_distinct_value_chunks=[],
            observed_values={"A", "B"},
            is_missing_level_value=lambda _value: False,
        ),
    )
    plan = SimpleNamespace(preserve_order=False)

    levels = _resolve_final_level_values(column, plan)

    assert levels == ["A", "B"]


def test_build_column_levels_returns_early_when_levels_not_needed():
    state = SimpleNamespace(
        declared_levels={"A": "Alpha"},
        observed_distinct_value_chunks=[],
        observed_values={"A", "B"},
        is_missing_level_value=lambda _value: False,
        raw_value_to_code_map=None,
        final_level_codes=None,
    )
    column = SimpleNamespace(
        name="factor_col",
        data_type=DataType.TEXT,
        state=state,
    )
    plan = SimpleNamespace(
        needs_levels=False,
        level_encoding="text",
        preserve_order=False,
    )

    result = build_column_levels(column, plan)

    assert result is column
    assert column.state.raw_value_to_code_map is None
    assert column.state.final_level_codes is None


def test_build_column_levels_text_creates_code_map_and_integer_codes():
    state = SimpleNamespace(
        declared_levels={"B": "Bee"},
        observed_distinct_value_chunks=[],
        observed_values={"A", "B"},
        is_missing_level_value=lambda _value: False,
        raw_value_to_code_map=None,
        final_level_codes=None,
    )
    column = SimpleNamespace(
        name="factor_col",
        data_type=DataType.TEXT,
        state=state,
    )
    plan = SimpleNamespace(
        needs_levels=True,
        level_encoding="integer",
        preserve_order=False,
    )

    result = build_column_levels(column, plan)

    assert result is column
    assert column.state.raw_value_to_code_map == {"B": 0, "A": 1}
    assert column.state.final_level_codes == [0, 1]
