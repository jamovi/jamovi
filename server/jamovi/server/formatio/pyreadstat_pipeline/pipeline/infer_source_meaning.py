
from server.formatio.pyreadstat_pipeline.data_types.data_types import *
import polars as pl

# ============================================================================
# Step 5: Infer source meaning
# ============================================================================

def infer_semantic_column_kind(info: SourceColumnInfo) -> SemanticColumnKind:
        """
        Collapse source metadata into a smaller semantic category.

        Priority matters:
        1. temporal formats
        2. categorical measure semantics
        3. text storage
        4. numeric fallback

        Example:
            NUMERIC + DATETIME + SCALE -> DATETIME
            NUMERIC + NUMERIC + ORDINAL -> ORDINAL_CODED
            STRING + STRING + UNKNOWN -> TEXT
        """
        if info.format_type == SourceFormatType.DATETIME:
            return SemanticColumnKind.DATETIME

        if info.format_type == SourceFormatType.DATE:
            return SemanticColumnKind.DATE

        if info.format_type == SourceFormatType.TIME:
            return SemanticColumnKind.TIME

        if info.measure_type == SourceMeasureType.ORDINAL:
            return SemanticColumnKind.ORDINAL_CODED

        if info.measure_type == SourceMeasureType.NOMINAL:
            if info.has_value_labels:
                    return SemanticColumnKind.NOMINAL_CANDIDATE
            return (
                    SemanticColumnKind.TEXT_CANDIDATE
                    if info.storage_type == SourceStorageType.STRING
                    else SemanticColumnKind.NOMINAL_CANDIDATE
            )
        
        if info.storage_type == SourceStorageType.STRING:
            return SemanticColumnKind.TEXT

        if info.storage_type == SourceStorageType.NUMERIC:
            return SemanticColumnKind.CONTINUOUS

        return SemanticColumnKind.UNKNOWN


