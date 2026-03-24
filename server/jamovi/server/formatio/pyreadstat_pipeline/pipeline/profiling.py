
from server.formatio.pyreadstat_pipeline.data_types.data_types import *

#from .infer_initial_semantic_kind import infer_initial_semantic_kind
import polars as pl
from .build_levels import append_column_levels, extract_chunk_levels

MAX_CATEGORICAL_LEVELS = 50

def initialize_column_profile_states(
        column: ImportColumn
) -> ImportColumn:
        column.is_frozen = not column.should_profile_kind()
        column.freeze_reason = "strong metadata inference" if not column.should_profile_kind() else None

        return column

def freeze_profile_state(
        column: ImportColumn,
        reason: str | None = None,
) -> ImportColumn:
        if column.is_frozen:
            return

        if column.final_kind == SemanticColumnKind.TEXT_CANDIDATE:
            column.final_kind = (
                    SemanticColumnKind.ID
                    if column.exceeded_categorical_threshold
                    else SemanticColumnKind.TEXT
            )

        elif column.final_kind == SemanticColumnKind.NOMINAL_CANDIDATE:
            column.final_kind = (
                    SemanticColumnKind.ID
                    if column.exceeded_categorical_threshold
                    else SemanticColumnKind.NOMINAL_CODED
            )

        print('FREEZE', column.name)

        column.is_frozen = True
        column.freeze_reason = reason
        return column

def update_profile_states_from_chunk(
        column: ImportColumn,
        chunk_df: pl.DataFrame
) -> ImportColumn:
        if column.is_frozen:
                return column
        if column.name not in chunk_df.columns:
                return column

        column.level_chunks.append(extract_chunk_levels())
        if column.seen_levels.height > MAX_CATEGORICAL_LEVELS:
                column.exceeded_categorical_threshold = True
                freeze_profile_state(column, reason="distinct threshold exceeded")
                return column
        return column

def finalize_unfrozen_profile_states(
        column: ImportColumn,
) -> None:
        if not column.is_frozen:
                freeze_profile_state(column, reason="forced finalization")
        return column

def profile_sav_column(
                column: ImportColumn,
                first_chunk: pl.DataFrame
        ) ->  ImportColumn:
        
        column = initialize_column_profile_states(column)
        column = update_profile_states_from_chunk(column ,first_chunk)
        
        return finalize_unfrozen_profile_states(column)
