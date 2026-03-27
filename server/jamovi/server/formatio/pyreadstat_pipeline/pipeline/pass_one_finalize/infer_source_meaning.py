
from server.formatio.pyreadstat_pipeline.data_types.types import *
from jamovi.core import MeasureType

# ============================================================================
# Step 5: Infer source meaning
# ============================================================================

def infer_semantic_column_kind(column: ImportColumn) -> ImportColumn:
    """Set and return the semantic kind inferred from source metadata."""
    column.state.final_kind = set_semantic_kind(column)
    return column

def set_semantic_kind(column: ImportColumn) -> SemanticColumnKind:
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
        if column.source_format == SourceFormatType.DATETIME:
            return SemanticColumnKind.DATETIME

        if column.source_format == SourceFormatType.DATE:
            return  SemanticColumnKind.DATE

        if column.source_format == SourceFormatType.TIME:
            return  SemanticColumnKind.TIME

        
        if column.measure_type == MeasureType.ORDINAL:
            return  SemanticColumnKind.ORDINAL_CODED

        if column.measure_type == MeasureType.NOMINAL:
            return (
                SemanticColumnKind.TEXT_CANDIDATE
                if column.data_type == DataType.TEXT
                else SemanticColumnKind.NOMINAL_CANDIDATE
            )
        
        if column.data_type == DataType.TEXT:
            return SemanticColumnKind.TEXT

        if column.is_numeric():
            return SemanticColumnKind.CONTINUOUS

        return SemanticColumnKind.UNKNOWN

