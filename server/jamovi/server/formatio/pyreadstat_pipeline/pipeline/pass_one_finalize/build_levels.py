import polars as pl
from typing import Any
from server.formatio.pyreadstat_pipeline.data_types.types import ImportColumn
from server.formatio.pyreadstat_pipeline.pipeline.pass_one_finalize.level_labels_strategy import LevelLabelPlan
from jamovi.server.dataset import DataType


def calculate_column_levels_payload(column: ImportColumn, plan: LevelLabelPlan) -> tuple[list[Any] | None, dict[Any, int] | None]:
    """Return finalized level codes and optional raw->code map without mutating the column."""
    if not plan.needs_levels:
        return None, None

    levels_list = _resolve_final_level_values(column, plan)
    raw_value_to_code_map: dict[Any, int] | None = None

    # Text categorical columns require integer level codes in jamovi.
    # Numeric categorical columns preserve their original coded values.
    if column.data_type == DataType.TEXT:
        raw_value_to_code_map = {}
        mapped_levels: list[int] = []
        for value in levels_list:
            if value not in raw_value_to_code_map:
                raw_value_to_code_map[value] = len(raw_value_to_code_map)
            mapped_levels.append(raw_value_to_code_map[value])

        levels_list = mapped_levels

    cast_levels = _cast_levels_by_encoding(
        levels_list,
        plan.level_encoding,
        column.name,
    )
    return cast_levels, raw_value_to_code_map


def _resolve_final_level_values(
    column: ImportColumn,
    plan: LevelLabelPlan,
) -> list[Any]:
    """Compose final level values from declared and observed sets with filtering."""
    declared_levels = list((column.state.declared_levels or {}).keys())
    observed_levels = _extract_observed_levels(column, plan)

    final_levels = []
    seen_values = set()

    for value in declared_levels:
        if _should_exclude_level_value(column, value) or value in seen_values:
            continue
        seen_values.add(value)
        final_levels.append(value)

    include_observed = not declared_levels or column.data_type == DataType.TEXT
    if include_observed:
        for value in observed_levels:
            if _should_exclude_level_value(column, value) or value in seen_values:
                continue
            seen_values.add(value)
            final_levels.append(value)

    return final_levels


def _should_exclude_level_value(column: ImportColumn, value: Any) -> bool:
    """Return whether a candidate level value should be excluded from levels."""
    if value is None:
        return True
    if isinstance(value, str) and value == '':
        return True
    return column.state.is_missing_level_value(value)


def _extract_observed_levels(
    column: ImportColumn,
    plan: LevelLabelPlan,
) -> list[Any]:
    """Collect observed levels, optionally preserving source order."""
    if column.state.observed_distinct_value_chunks:
        merged_levels = pl.concat(column.state.observed_distinct_value_chunks).unique(subset=[column.name])

        if not plan.preserve_order:
            merged_levels = merged_levels.sort(column.name)

        return merged_levels.get_column(column.name).to_list()

    observed_levels = [value for value in (column.state.observed_values or []) if value is not None]
    if not plan.preserve_order:
        observed_levels.sort()
    return observed_levels


def _cast_levels_by_encoding(
    levels: list[Any],
    level_encoding: str,
    column_name: str,
) -> list[Any]:
    """
    Cast level values according to the encoding strategy.
    
    Args:
        levels: List of raw level values
        level_encoding: How to encode ('integer', 'decimal', 'text', 'none')
        value_cast_type: Target DataType for values
        
    Returns:
        Casted list of levels
    """
    caster = {
        'integer': int,
        'decimal': float,
        'text': str,
    }.get(level_encoding)

    if caster is None:
        return levels

    try:
        return [caster(value) for value in levels]
    except (TypeError, ValueError) as e:
        sample_value = next((value for value in levels if value is not None), None)
        raise ValueError(
            "Failed to cast level values for column "
            f"'{column_name}' with encoding '{level_encoding}'. "
            f"Sample value: {sample_value!r}"
        ) from e

