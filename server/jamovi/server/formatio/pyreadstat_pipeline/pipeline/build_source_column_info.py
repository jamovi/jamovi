import polars as pl

from server.formatio.pyreadstat_pipeline.data_types.data_types import *
from .infer_meta_data.format_type import format_type
from .infer_meta_data.measure_type import measure_type
from .infer_meta_data.missing_ranges import missing_ranges
from .infer_meta_data.storage_type import storage_type
from .infer_meta_data.variable_label import variable_label
from .infer_meta_data.variable_width import variable_width



# ============================================================================
# Step 2: Build normalized source descriptors
# ============================================================================

def build_source_column_info(df: pl.DataFrame, meta: PyreadstatMeta) -> dict[str, SourceColumnInfo]:
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
        infos: dict[str, SourceColumnInfo] = {}

        variable_value_labels = getattr(meta, "variable_value_labels", {})
        original_variable_types = getattr(meta, "original_variable_types", {})

        #
        for col in df.iter_columns():
            name = col.name
            value_labels = variable_value_labels.get(name, {}) or {}

            stype =  storage_type(meta, name)

            infos[name] = SourceColumnInfo(
                    name = name,
                    storage_type = stype,
                    format_type = format_type(meta, name),
                    measure_type = measure_type(meta, name),
                    polars_dtype = df[name].dtype,
                    column_width = variable_width(meta, name),
                    has_value_labels = bool(value_labels),
                    value_labels = value_labels,
                    variable_label = variable_label(meta, name, df),
                    missing_ranges = missing_ranges(meta, name, storage_type),
                    source_format_code=original_variable_types.get(name),
            )

        return infos
