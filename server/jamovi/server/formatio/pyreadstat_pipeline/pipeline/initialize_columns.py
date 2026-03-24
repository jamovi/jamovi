import polars as pl

from server.formatio.pyreadstat_pipeline.data_types.data_types import *
from jamovi.server.instancemodel import InstanceModel

from .infer_meta_data.format_type import format_type
from .infer_meta_data.measure_type import measure_type
from .infer_meta_data.missing_ranges import missing_ranges
from .infer_meta_data.column_label import column_label
from .infer_meta_data.variable_width import variable_width
from .infer_meta_data.value_levels import value_levels

# ============================================================================
# Step 2: Build normalized source descriptors
# ============================================================================

def initialize_columns(df: pl.DataFrame, meta: PyreadstatMeta, model: InstanceModel) -> list[ImportColumn]:
        """
        Build a clean internal descriptor for each source column.

        Responsibility:
        - Convert raw pyreadstat metadata into importer-friendly objects
        - Do not mutate values
        - Do not decide jamovi types yet

        Example:
            infos = build_source_column_info(df, meta)
            info = infos["satisfaction"]
        """
        out_cols = []

        for col in df.iter_columns():
            name = col.name
            column = model.append_column(name)

            column.width = variable_width(meta, name)
            column.description = column_label(meta, name, df)
            column.set_measure_type(measure_type(meta, name))
            column.source_format = format_type(meta, name)
            column.final_polars_dtype = col.dtype
            column.value_levels = value_levels(meta, name, df)
            column.set_missing_values(missing_ranges(meta, name, column))
            
            column.is_frozen = False
            column.seen_levels = pl.DataFrame()
            column.exceeded_categorical_threshold = False
            column.freeze_reason = None


            out_cols.append(column)


        return out_cols
