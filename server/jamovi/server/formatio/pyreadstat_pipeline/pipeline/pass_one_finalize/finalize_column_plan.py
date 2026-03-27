
import polars as pl
from jamovi.server.dataset import DataType
from jamovi.core import MeasureType
from server.formatio.pyreadstat_pipeline.data_types.types import ImportColumn, SemanticColumnKind
from .build_levels import build_column_levels
from .level_labels_strategy import get_level_label_plan, get_level_label_strategy
from ..infer_metadata.missing_ranges import render_missing_ranges


DIRECT_PLAN_BY_KIND = {
    SemanticColumnKind.TEXT: (DataType.TEXT, MeasureType.NOMINAL),
    SemanticColumnKind.DATE: (DataType.INTEGER, MeasureType.ORDINAL),
    SemanticColumnKind.TIME: (DataType.INTEGER, MeasureType.ORDINAL),
    SemanticColumnKind.DATETIME: (DataType.INTEGER, MeasureType.ORDINAL),
}

CODED_MEASURE_BY_KIND = {
    SemanticColumnKind.ORDINAL_CODED: MeasureType.ORDINAL,
    SemanticColumnKind.NOMINAL_CODED: MeasureType.NOMINAL,
}

def finalize_column_plan(
        column: ImportColumn
) -> ImportColumn:
        """
        Convert semantic meaning into a jamovi write plan.

        Responsibility:
        - Decide final jamovi data/measure types
        - Include levels if applicable
        - Preserve labels/order

        Example:
            ORDINAL_CODED -> INTEGER + ORDINAL + levels
            TEXT -> TEXT + NOMINAL
            CONTINUOUS -> DECIMAL + CONTINUOUS
        """
        if column.state.final_kind in CODED_MEASURE_BY_KIND:
            column.set_data_type(
                DataType.TEXT if column.is_any_label_bits_too_wide() else DataType.INTEGER
            )
            column.set_measure_type(CODED_MEASURE_BY_KIND[column.state.final_kind])
            return column

        if column.state.final_kind == SemanticColumnKind.ID:
            column.set_data_type(
                DataType.TEXT if column.final_polars_dtype() == pl.Utf8 else DataType.INTEGER
            )
            column.set_measure_type(MeasureType.ID)
            return column

        if column.state.final_kind == SemanticColumnKind.CONTINUOUS:
            if column.data_type not in (DataType.INTEGER, DataType.DECIMAL):
                column.set_data_type(DataType.DECIMAL)
            column.set_measure_type(MeasureType.CONTINUOUS)
            return column

        direct_plan = DIRECT_PLAN_BY_KIND.get(column.state.final_kind)
        if direct_plan is not None:
            data_type, measure_type = direct_plan
            column.set_data_type(data_type)
            column.set_measure_type(measure_type)

        return column


def finalize_column_runtime_state(column: ImportColumn) -> ImportColumn:
        """Finalize plan, missing rules, and levels for a profiled import column."""
        column = finalize_column_plan(column)
        column.set_missing_values(render_missing_ranges(column))

        strategy = get_level_label_strategy(column)
        plan = get_level_label_plan(column, strategy)

        if plan.is_integer_like:
            column.set_data_type(DataType.INTEGER)
            strategy = get_level_label_strategy(column)
            plan = get_level_label_plan(column, strategy)

        return build_column_levels(column, plan)


