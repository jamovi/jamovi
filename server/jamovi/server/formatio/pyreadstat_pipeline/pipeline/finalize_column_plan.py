
from numbers import Number

import polars as pl
from jamovi.server.dataset import DataType
from jamovi.core import MeasureType
from server.formatio.pyreadstat_pipeline.data_types.data_types import *

# ============================================================================
# Step 7: Build target jamovi plan
# ============================================================================

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
        #column.value_levels=sorted(column.value_levels.items(), key=lambda kv: kv[0])

        match column.final_kind:
            case SemanticColumnKind.ORDINAL_CODED:
                column.set_data_type(DataType.TEXT 
                            if column.is_any_label_bits_too_wide() 
                            else DataType.INTEGER)
                column.set_measure_type(MeasureType.ORDINAL)
            case SemanticColumnKind.NOMINAL_CODED:
                column.set_data_type(DataType.TEXT 
                            if column.is_any_label_bits_too_wide() 
                            else DataType.INTEGER)
                column.set_measure_type(MeasureType.ORDINAL)
            case SemanticColumnKind.ID:
                    column.set_data_type(
                        DataType.TEXT
                        if column.data_type == DataType.STRING
                        else DataType.INTEGER
                    )
                    column.set_measure_type(MeasureType.ID)
            case SemanticColumnKind.TEXT:
                    column.set_data_type(DataType.TEXT)
                    column.set_measure_type(MeasureType.NOMINAL)
            case SemanticColumnKind.DATE | SemanticColumnKind.TIME | SemanticColumnKind.DATETIME:
                    column.set_data_type(DataType.INTEGER)
                    column.set_measure_type(MeasureType.ORDINAL)
            case SemanticColumnKind.CONTINUOUS:
                    column.set_data_type(column.infer_numeric_target_type())
                    column.set_measure_type(MeasureType.CONTINUOUS)

        return column


