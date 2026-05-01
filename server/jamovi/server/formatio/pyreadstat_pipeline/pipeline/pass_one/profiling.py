from jamovi.server.formatio.pyreadstat_pipeline import logger as pipeline_logger
from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import DataType, ImportColumn, MeasureType, SemanticColumnKind
import polars as pl
from .chunk_levels import get_unique_values_from_chunk

MAX_DISTINCT_VALUES_FOR_LEVELS = 50
FINALIZED_KIND_BY_PROVISIONAL_KIND = {
        SemanticColumnKind.TEXT_CANDIDATE: SemanticColumnKind.TEXT,
        SemanticColumnKind.NOMINAL_CANDIDATE: SemanticColumnKind.NOMINAL_CODED,
}
KINDS_SUBJECT_TO_ID_DETECTION = {
        SemanticColumnKind.TEXT_CANDIDATE,
        SemanticColumnKind.NOMINAL_CANDIDATE,
        SemanticColumnKind.TEXT,
}
KINDS_SUBJECT_TO_NUMERIC_CONTINUOUS_FALLBACK = {
        SemanticColumnKind.NOMINAL_CANDIDATE,
        SemanticColumnKind.ORDINAL_CODED,
}

FINALIZED_KIND_NAME_BY_PROVISIONAL_KIND_NAME = {
    "TEXT_CANDIDATE": "TEXT",
    "NOMINAL_CANDIDATE": "NOMINAL_CODED",
}
KINDS_SUBJECT_TO_ID_DETECTION_NAMES = {
    "TEXT_CANDIDATE",
    "NOMINAL_CANDIDATE",
    "TEXT",
}
KINDS_SUBJECT_TO_NUMERIC_CONTINUOUS_FALLBACK_NAMES = {
    "NOMINAL_CANDIDATE",
    "ORDINAL_CODED",
}

logger = pipeline_logger

def initialize_column_profile_states(
    column: ImportColumn
) -> ImportColumn:
    """Initialize profiling flags based on whether the column still needs profiling."""
    should_profile = column.should_profile_kind() or _should_profile_numeric_categorical(column)
    column.state.is_profiling_complete = not should_profile
    column.state.profiling_complete_reason = "strong metadata inference" if not should_profile else None

    return column

def finalize_profiling_state(
    column: ImportColumn,
    reason: str | None = None,
) -> ImportColumn:
    """Finalize semantic kind resolution and mark profiling as complete."""
    if column.state.is_profiling_complete:
        return column

    column.state.final_kind = _infer_finalized_kind(column)

    logger.debug("finalize_profiling_state column=%s reason=%s", column.name, reason)

    column.state.is_profiling_complete = True
    column.state.profiling_complete_reason = reason
    return column

def update_profile_states_from_chunk(
    column: ImportColumn,
    chunk_df: pl.DataFrame
) -> ImportColumn:
    """Accumulate distinct observed values and enforce cardinality limits."""
    if column.state.is_profiling_complete or column.name not in chunk_df.columns:
        return column

    if _should_profile_numeric_categorical(column):
        column.check_chunk_for_non_integer_floats(chunk_df)

    current_levels = get_unique_values_from_chunk(column.name, chunk_df)
    column.state.observed_values.update(current_levels.get_column(column.name).to_list())

    if not column.state.exceeded_cardinality_limit:
        column.state.observed_distinct_value_chunks.append(current_levels)

    if len(column.state.observed_values) > MAX_DISTINCT_VALUES_FOR_LEVELS:
        column.state.exceeded_cardinality_limit = True
        column.state.observed_distinct_value_chunks = []   # release memory; levels won't be built
        finalize_profiling_state(column, reason="distinct threshold exceeded")

    return column

def finalize_unfrozen_profile_states(
    column: ImportColumn,
) -> ImportColumn:
    """Finalize any column whose profiling state was not completed in chunks."""
    if not column.state.is_profiling_complete:
        finalize_profiling_state(column, reason="forced finalization")
    return column

def profile_sav_column(
    column: ImportColumn,
    chunk_df: pl.DataFrame
) -> ImportColumn:
    """Update profiling state from one chunk after initialization."""
    return update_profile_states_from_chunk(column, chunk_df)


def _infer_finalized_kind(column: ImportColumn) -> SemanticColumnKind:
    """Resolve final semantic kind, promoting high-cardinality columns to ID."""
    current_kind = column.state.final_kind
    current_kind_name = getattr(current_kind, "name", None)

    if (
        column.state.seen_non_integer_float
        and current_kind_name in KINDS_SUBJECT_TO_NUMERIC_CONTINUOUS_FALLBACK_NAMES
    ):
        return _kind_member_like(current_kind, "CONTINUOUS")

    if (
        column.state.exceeded_cardinality_limit
        and current_kind_name in KINDS_SUBJECT_TO_ID_DETECTION_NAMES
    ):
        return _kind_member_like(current_kind, "ID")

    finalized_kind_name = FINALIZED_KIND_NAME_BY_PROVISIONAL_KIND_NAME.get(current_kind_name)
    if finalized_kind_name is not None:
        return _kind_member_like(current_kind, finalized_kind_name)

    return FINALIZED_KIND_BY_PROVISIONAL_KIND.get(current_kind, current_kind)


def _kind_member_like(current_kind: SemanticColumnKind | object, member_name: str) -> SemanticColumnKind:
    """Return enum member from current_kind's enum class when available."""
    enum_cls = type(current_kind) if current_kind is not None else SemanticColumnKind
    return getattr(enum_cls, member_name, getattr(SemanticColumnKind, member_name))


def _should_profile_numeric_categorical(column: ImportColumn) -> bool:
    """Return True for decimal nominal/ordinal columns that may downgrade to continuous."""
    return (
        column.data_type == DataType.DECIMAL
        and column.measure_type in {MeasureType.NOMINAL, MeasureType.ORDINAL}
    )
