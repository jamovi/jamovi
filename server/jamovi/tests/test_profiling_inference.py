"""Tests for profiling final-kind inference behavior."""

from types import SimpleNamespace

from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import SemanticColumnKind
from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_one.profiling import finalize_profiling_state


def test_non_integer_numeric_nominal_falls_back_to_continuous():
    """Legacy parity: non-integer numeric nominal values should become continuous."""
    column = SimpleNamespace(
        name="x",
        state=SimpleNamespace(
            is_profiling_complete=False,
            final_kind=SemanticColumnKind.NOMINAL_CANDIDATE,
            seen_non_integer_float=True,
            exceeded_cardinality_limit=False,
            profiling_complete_reason=None,
        ),
    )

    finalize_profiling_state(column, reason="chunk profiling")

    assert column.state.final_kind is SemanticColumnKind.CONTINUOUS
    assert column.state.is_profiling_complete is True


def test_non_integer_numeric_ordinal_falls_back_to_continuous():
    """Legacy parity: non-integer numeric ordinal values should become continuous."""
    column = SimpleNamespace(
        name="x",
        state=SimpleNamespace(
            is_profiling_complete=False,
            final_kind=SemanticColumnKind.ORDINAL_CODED,
            seen_non_integer_float=True,
            exceeded_cardinality_limit=False,
            profiling_complete_reason=None,
        ),
    )

    finalize_profiling_state(column, reason="chunk profiling")

    assert column.state.final_kind is SemanticColumnKind.CONTINUOUS


def test_high_cardinality_text_candidate_promotes_to_id():
    """High-cardinality text candidate should still promote to ID."""
    column = SimpleNamespace(
        name="x",
        state=SimpleNamespace(
            is_profiling_complete=False,
            final_kind=SemanticColumnKind.TEXT_CANDIDATE,
            seen_non_integer_float=False,
            exceeded_cardinality_limit=True,
            profiling_complete_reason=None,
        ),
    )

    finalize_profiling_state(column, reason="distinct threshold exceeded")

    assert column.state.final_kind is SemanticColumnKind.ID
