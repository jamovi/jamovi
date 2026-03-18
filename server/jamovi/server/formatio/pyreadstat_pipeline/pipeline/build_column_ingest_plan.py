
from server.formatio.pyreadstat_pipeline.data_types.data_types import *
import polars as pl

# ============================================================================
# Step 3: Decide whether values need normalization before mapping
# ============================================================================

def build_column_ingest_plan(info: SourceColumnInfo) -> ColumnIngestPlan:
        """
        Decide whether the in-memory values need normalization before writing.

        Responsibility:
        - Value cleanup / casting decisions only
        - No jamovi mutation
        - No level attachment

        Good examples:
        - ordinal float codes -> cast to Int64
        - nominal float codes -> cast to Int64
        - datetime numeric -> preserve as temporal-backed numeric for later handling
        """

        # print('FORMAT_TYPPPPPE' ,info.format_type)
        # print(f"Type: {type(info.format_type)}, Value: {info.format_type}")
        # print(f"DEBUG: info.format_type id: {id(info.format_type.__class__)}")
        # print(f"DEBUG: SourceFormatType id: {id(SourceFormatType)}")
        # print(f"DEBUG: Match? {info.format_type == SourceFormatType.DATE}")
        if info.format_type == SourceFormatType.DATE or info.format_type == SourceFormatType.TIME or info.format_type == SourceFormatType.DATETIME:
            return ColumnIngestPlan(
                    name=info.name,
                    cast_to=pl.Int32,
                    fill_nulls=-2147483648,
                    preserve_temporal_numeric=True,
            )

        if info.measure_type in {SourceMeasureType.ORDINAL, SourceMeasureType.NOMINAL}:
            print('plan_type', info.polars_dtype)
            if info.polars_dtype == pl.Float64 or info.polars_dtype == pl.Float32:
                return ColumnIngestPlan(name=info.name, cast_to=pl.Int32)
        
        if info.format_type == SourceFormatType.NUMERIC and info.storage_type == SourceStorageType.NUMERIC:
            print('plan_type', info.polars_dtype)
            if info.polars_dtype == pl.Float64 or info.polars_dtype == pl.Float32:
                return ColumnIngestPlan(name=info.name, cast_to=pl.Int32)
        

        return ColumnIngestPlan(name=info.name, cast_to=None)

