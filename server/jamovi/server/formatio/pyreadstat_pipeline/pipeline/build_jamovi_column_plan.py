
from numbers import Number

import polars as pl
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType
from server.formatio.pyreadstat_pipeline.data_types.data_types import *

# ============================================================================
# Step 7: Build target jamovi plan
# ============================================================================

JAMOVI_MAX_BITS = 32

def _infer_numeric_target_type(info: SourceColumnInfo) -> DataType:
        """
        Choose INTEGER vs DECIMAL for numeric-like columns.

        Very simple first pass:
        - Int64 -> INTEGER
        - otherwise -> DECIMAL
        """
        if info.polars_dtype == pl.Int64 or info.polars_dtype == pl.Int32:
            return DataType.INTEGER

        return DataType.DECIMAL

def is_any_label_bits_too_wide(value_labels):
    if value_labels is not None:
        for value in value_labels:
            if isinstance(value, Number) and int(value).bit_length() > JAMOVI_MAX_BITS:
                return True
    return False

def build_jamovi_column_plan(
        column_info: SourceColumnInfo,
        final_kind: SemanticColumnKind,
) -> JamoviColumnPlan:
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
             
        if final_kind == SemanticColumnKind.ORDINAL_CODED:
            return JamoviColumnPlan(
                    name=column_info.name,
                    data_type=(DataType.TEXT 
                               if is_any_label_bits_too_wide(column_info.value_labels) 
                               else DataType.INTEGER),
                    measure_type=MeasureType.ORDINAL,
                    column_width=column_info.column_width,
                    levels=sorted(column_info.value_labels.items(), key=lambda kv: kv[0]),
                    variable_label=column_info.variable_label,
            )

        if final_kind == SemanticColumnKind.NOMINAL_CODED:
            return JamoviColumnPlan(
                    name=column_info.name,
                    data_type=(DataType.TEXT 
                               if is_any_label_bits_too_wide(column_info.value_labels) 
                               else DataType.INTEGER),
                    measure_type=MeasureType.NOMINAL,
                    column_width=column_info.column_width,
                    levels=sorted(column_info.value_labels.items(), key=lambda kv: kv[0]),
                    variable_label=column_info.variable_label,
                    missing_values=column_info.missing_ranges,
            )
        
        if final_kind == SemanticColumnKind.ID:
            return JamoviColumnPlan(
                    name=column_info.name,
                    data_type=(
                        DataType.TEXT
                        if column_info.storage_type == SourceStorageType.STRING
                        else DataType.INTEGER
                    ),
                    measure_type=MeasureType.ID,
                    levels=[],
                    variable_label=column_info.variable_label,
                    missing_values=column_info.missing_ranges,
        )

        if final_kind == SemanticColumnKind.TEXT:
            return JamoviColumnPlan(
                    name=column_info.name,
                    data_type=DataType.TEXT,
                    measure_type=MeasureType.NOMINAL,
                    column_width=column_info.column_width,
                    levels=[],
                    variable_label=column_info.variable_label,
                    missing_values=column_info.missing_ranges,
            )

        if final_kind in {SemanticColumnKind.DATE, SemanticColumnKind.TIME, SemanticColumnKind.DATETIME}:
            # You will likely refine this once you settle your jamovi temporal strategy.
            return JamoviColumnPlan(
                    name=column_info.name,
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.ORDINAL,
                    column_width=column_info.column_width,
                    levels=[],
                    variable_label=column_info.variable_label,
                    missing_values=column_info.missing_ranges,
            )

        if final_kind == SemanticColumnKind.CONTINUOUS:
            print('INTEGER INTEGER')
            return JamoviColumnPlan(
                    name=column_info.name,
                    data_type=_infer_numeric_target_type(column_info),
                    measure_type=MeasureType.CONTINUOUS,
                    column_width=column_info.column_width,
                    levels=[],
                    variable_label=column_info.variable_label,
                    missing_values=column_info.missing_ranges,
            )

        return JamoviColumnPlan(
            name=column_info.name,
            data_type=DataType.TEXT,
            measure_type=MeasureType.NOMINAL,
            column_width=column_info.column_width,
            levels=[],
            variable_label=column_info.variable_label,
            missing_values=column_info.missing_ranges,
        )

