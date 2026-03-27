import polars as pl
from typing import Any
from server.formatio.pyreadstat_pipeline import logger as pipeline_logger
from server.formatio.pyreadstat_pipeline.data_types.types import ImportColumn
from server.formatio.pyreadstat_pipeline.pipeline.pass_one_finalize.level_labels_strategy import LevelLabelPlan
from jamovi.server.dataset import DataType


logger = pipeline_logger

def build_column_levels(column: ImportColumn, plan: LevelLabelPlan) -> ImportColumn:
    """
    Build and finalize level labels based on LevelLabelPlan strategy.
    
    Merges observed_distinct_value_chunks and final_level_codes according to the column's
    data_type and measure_type.
    
    Special handling for DECIMAL nominal/ordinal:
    - If all values are integer-like (e.g., 1.0, 2.0), convert to INTEGER
    
    Args:
        column: ImportColumn with observed_distinct_value_chunks populated from chunks
        plan: Precomputed level label plan for this column
    """
    logger.debug("build_column_levels entry column=%s", column.name)

    # If no levels needed, return early
    if not plan.needs_levels:
        logger.debug("build_column_levels no levels needed for column=%s", column.name)
        return column
    
    logger.debug("build_column_levels plan column=%s needs_levels=%s level_encoding=%s is_integer_like=%s",
        column.name, plan.needs_levels, plan.level_encoding, plan.is_integer_like)
    levels_list = _resolve_final_level_values(column, plan)
    
    # Text categorical columns require integer level codes in jamovi.
    # Numeric categorical columns preserve their original coded values.
    if column.data_type == DataType.TEXT:
        raw_value_to_code_map = {}
        mapped_levels = []
        for value in levels_list:
            if value not in raw_value_to_code_map:
                raw_value_to_code_map[value] = len(raw_value_to_code_map)
            mapped_levels.append(raw_value_to_code_map[value])
        
        if raw_value_to_code_map:
            column.state.raw_value_to_code_map = raw_value_to_code_map
            levels_list = mapped_levels
    
    # Cast levels according to plan
    cast_levels = _cast_levels_by_encoding(
        levels_list,
        plan.level_encoding,
    )
    
    # Set the finalized levels on the column
    column.state.final_level_codes = cast_levels

    logger.info("build_column_levels complete column=%s levels=%s map=%s", column.name,
        len(column.state.final_level_codes) if column.state.final_level_codes else 0, bool(column.state.raw_value_to_code_map))
    return column


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

    observed_levels = list(column.state.observed_values or [])
    if not plan.preserve_order:
        observed_levels.sort()
    return observed_levels


def _cast_levels_by_encoding(
    levels: list[Any],
    level_encoding: str
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

    return [caster(value) for value in levels]

