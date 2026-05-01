import polars as pl
from jamovi.server.dataset import DataType
from jamovi.core import MeasureType
from types import SimpleNamespace

from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import (
    ColumnFinalPlan,
    ImportColumn,
    POLARS_DTYPE_BY_DATA_TYPE,
    SemanticColumnKind,
    TEMPORAL_SOURCE_FORMATS,
)
from .build_levels import calculate_column_levels_payload
from .level_labels_strategy import get_level_label_plan, get_level_label_strategy
from ..infer_metadata.missing_ranges import render_missing_ranges


DIRECT_PLAN_BY_KIND = {
    SemanticColumnKind.TEXT: (DataType.TEXT, MeasureType.NOMINAL),
    SemanticColumnKind.DATE: (DataType.INTEGER, MeasureType.ORDINAL),
    SemanticColumnKind.TIME: (DataType.INTEGER, MeasureType.ORDINAL),
    SemanticColumnKind.DATETIME: (DataType.INTEGER, MeasureType.CONTINUOUS),
}

CODED_MEASURE_BY_KIND = {
    SemanticColumnKind.ORDINAL_CODED: MeasureType.ORDINAL,
    SemanticColumnKind.NOMINAL_CODED: MeasureType.NOMINAL,
}


def _resolve_data_measure(column: ImportColumn) -> tuple[DataType, MeasureType]:
        """Resolve final data/measure types from semantic kind without mutating input."""
        if column.state.final_kind in CODED_MEASURE_BY_KIND:
            data_type = DataType.TEXT if column.is_any_label_bits_too_wide() else DataType.INTEGER
            return data_type, CODED_MEASURE_BY_KIND[column.state.final_kind]

        if column.state.final_kind == SemanticColumnKind.ID:
            data_type = DataType.TEXT if POLARS_DTYPE_BY_DATA_TYPE.get(column.data_type, pl.Utf8) == pl.Utf8 else DataType.INTEGER
            return data_type, MeasureType.ID

        if column.state.final_kind == SemanticColumnKind.CONTINUOUS:
            data_type = column.data_type
            if data_type not in (DataType.INTEGER, DataType.DECIMAL):
                data_type = DataType.DECIMAL
            return data_type, MeasureType.CONTINUOUS

        direct_plan = DIRECT_PLAN_BY_KIND.get(column.state.final_kind)
        if direct_plan is not None:
            return direct_plan

        return column.data_type, column.measure_type


def build_column_runtime_plan(column: ImportColumn) -> ColumnFinalPlan:
    """Build an immutable runtime plan for a profiled import column."""
    data_type, measure_type = _resolve_data_measure(column)

    if (
        data_type == DataType.DECIMAL
        and measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL)
        and column.state.are_all_values_integer_like()
    ):
        data_type = DataType.INTEGER

    missing_values = render_missing_ranges(column)

    planning_column = SimpleNamespace(
        name=column.name,
        data_type=data_type,
        measure_type=measure_type,
        state=column.state,
    )

    strategy = get_level_label_strategy(planning_column)
    level_plan = get_level_label_plan(planning_column, strategy)
    final_level_codes, raw_value_to_code_map = calculate_column_levels_payload(planning_column, level_plan)

    preserve_temporal_numeric = column.source_format in TEMPORAL_SOURCE_FORMATS
    fill_null_value = -2147483648 if preserve_temporal_numeric else None

    plan = ColumnFinalPlan(
        name=column.name,
        index=getattr(column, "index", None),
        source_format=column.source_format,
        semantic_kind=column.state.final_kind,
        data_type=data_type,
        measure_type=measure_type,
        missing_values=list(missing_values),
        declared_levels=dict(column.state.declared_levels or {}),
        final_level_codes=list(final_level_codes) if final_level_codes is not None else None,
        raw_value_to_code_map=dict(raw_value_to_code_map) if raw_value_to_code_map is not None else None,
        final_polars_dtype=POLARS_DTYPE_BY_DATA_TYPE.get(data_type, pl.Utf8),
        preserve_temporal_numeric=preserve_temporal_numeric,
        fill_null_value=fill_null_value,
    )
    
    # Debug logging
    from jamovi.server.formatio.pyreadstat_pipeline import logger as pipeline_logger
    if measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL):
        pipeline_logger.info(
            "build_column_runtime_plan: %s data_type=%s measure_type=%s dtype=%s levels=%s raw_codes=%s",
            column.name, data_type, measure_type, plan.final_polars_dtype, 
            len(final_level_codes) if final_level_codes else 0,
            len(raw_value_to_code_map) if raw_value_to_code_map else 0
        )
    
    return plan


def apply_column_runtime_plan(column: ImportColumn, plan: ColumnFinalPlan) -> ImportColumn:
    """Apply an immutable runtime plan to the mutable ImportColumn/jamovi column."""
    column.set_data_type(plan.data_type)
    column.set_measure_type(plan.measure_type)
    column.set_missing_values(plan.missing_values)

    column.state.final_level_codes = list(plan.final_level_codes) if plan.final_level_codes is not None else None
    column.state.raw_value_to_code_map = (
        dict(plan.raw_value_to_code_map) if plan.raw_value_to_code_map is not None else None
    )
    return column


