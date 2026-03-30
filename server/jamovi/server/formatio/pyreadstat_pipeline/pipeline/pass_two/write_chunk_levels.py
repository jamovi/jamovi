from collections.abc import Iterator
from typing import Any
from server.formatio.pyreadstat_pipeline import logger as pipeline_logger
from server.formatio.pyreadstat_pipeline.data_types.types import ColumnFinalPlan, ImportColumn


logger = pipeline_logger


def write_chunk_levels(columns: list[ImportColumn], column_plans: list[ColumnFinalPlan]) -> None:
    """
    Append finalized level labels to columns.

    Only appends levels that were already built in build_levels.py.
    Uses column.state.raw_value_to_code_map for value-to-code mapping if present.

    Args:
        columns: List of ImportColumn objects with finalized final_level_codes
    """
    logger.debug("write_chunk_levels start")
    columns_with_levels = 0
    appended_levels = 0
    for column, plan in zip(columns, column_plans):
        if not plan.final_level_codes:
            continue

        columns_with_levels += 1

        written_values = set()

        for raw_value, code in _iter_level_pairs(plan):
            if code in written_values:
                continue
            written_values.add(code)

            label = _get_label_for_value(plan, raw_value)
            pinned = _is_declared_level_value(plan, raw_value)
            column.append_level(code, label, str(raw_value), pinned=pinned)
            appended_levels += 1

    logger.debug(
        "write_chunk_levels complete columns_with_levels=%s appended_levels=%s",
        columns_with_levels,
        appended_levels,
    )


def _get_label_for_value(column_plan: ColumnFinalPlan, value: Any) -> str:
    """Generate a label string from a value."""
    declared_label = _get_declared_label_for_value(column_plan, value)
    if declared_label is not None:
        return declared_label

    if value is None:
        return ''

    if isinstance(value, str):
        return value

    if isinstance(value, bool):
        return 'Yes' if value else 'No'

    if isinstance(value, (int, float)):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)

    return str(value)


def _is_declared_level_value(column_plan: ColumnFinalPlan, value: Any) -> bool:
    """Return whether a value exists in declared level metadata."""
    return _get_declared_label_for_value(column_plan, value) is not None


def _iter_level_pairs(column_plan: ColumnFinalPlan) -> Iterator[tuple[Any, Any]]:
    """Yield raw-value/code pairs using either explicit maps or direct values."""
    if column_plan.raw_value_to_code_map:
        yield from column_plan.raw_value_to_code_map.items()
        return

    for value in column_plan.final_level_codes or []:
        if value is None:
            continue
        yield value, value


def _get_declared_label_for_value(column_plan: ColumnFinalPlan, value: Any) -> str | None:
    """Return a declared label for a value, matching by raw or string form."""
    declared_levels = column_plan.declared_levels or {}
    if value in declared_levels:
        return declared_levels[value]

    value_as_string = str(value)
    for declared_value, declared_label in declared_levels.items():
        if str(declared_value) == value_as_string:
            return declared_label

    return None
