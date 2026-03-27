"""Tests for pyreadstat pipeline level writing."""

from types import SimpleNamespace
from unittest.mock import Mock, call

from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_two.write_chunk_levels import write_chunk_levels


def test_write_chunk_levels_uses_declared_labels_and_pinning():
    """Declared level labels should be preferred, including string/number key matches."""
    state = SimpleNamespace(
        final_level_codes=[1, 2],
        raw_value_to_code_map=None,
        declared_levels={"1": "One"},
    )
    column = SimpleNamespace(
        name="x",
        state=state,
        append_level=Mock(),
    )

    write_chunk_levels([column])

    assert column.append_level.call_count == 2
    assert column.append_level.call_args_list == [
        call(1, "One", "1", pinned=True),
        call(2, "2", "2", pinned=False),
    ]


def test_write_chunk_levels_deduplicates_when_multiple_raw_values_share_code():
    """Only one level append should occur per resolved code."""
    state = SimpleNamespace(
        final_level_codes=[10, 11],
        raw_value_to_code_map={10: 0, 11: 0},
        declared_levels={},
    )
    column = SimpleNamespace(
        name="x",
        state=state,
        append_level=Mock(),
    )

    write_chunk_levels([column])

    column.append_level.assert_called_once_with(0, "10", "10", pinned=False)
