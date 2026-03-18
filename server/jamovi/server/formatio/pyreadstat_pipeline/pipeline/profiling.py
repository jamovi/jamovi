
from numbers import Number


from server.formatio.pyreadstat_pipeline.data_types.data_types import *

#from .infer_initial_semantic_kind import infer_initial_semantic_kind
import polars as pl

from .infer_source_meaning import infer_semantic_column_kind

MAX_CATEGORICAL_LEVELS = 50
PROFILE_VALUE_LIMIT = 200

def should_profile_kind(kind: SemanticColumnKind) -> bool:
    return kind in {
        SemanticColumnKind.TEXT_CANDIDATE,
        SemanticColumnKind.NOMINAL_CANDIDATE,
    }

def build_profile_states(
        source_infos: dict[str, SourceColumnInfo],
) -> dict[str, ColumnProfileState]:
        states: dict[str, ColumnProfileState] = {}

        for name, info in source_infos.items():
            kind = infer_semantic_column_kind(info)

            states[name] = ColumnProfileState(
                    name=name,
                    kind=kind,
                    is_frozen=not should_profile_kind(kind),
                    freeze_reason=(
                        "strong metadata inference"
                        if not should_profile_kind(kind)
                        else None
                    ),
            )

        return states

def freeze_profile_state(
        state: ColumnProfileState,
        reason: str | None = None,
) -> None:
        if state.is_frozen:
            return

        if state.kind == SemanticColumnKind.TEXT_CANDIDATE:
            state.kind = (
                    SemanticColumnKind.ID
                    if state.exceeded_categorical_threshold
                    else SemanticColumnKind.TEXT
            )

        elif state.kind == SemanticColumnKind.NOMINAL_CANDIDATE:
            state.kind = (
                    SemanticColumnKind.ID
                    if state.exceeded_categorical_threshold
                    else SemanticColumnKind.NOMINAL_CODED
            )

        state.is_frozen = True
        state.freeze_reason = reason


def update_profile_state_from_series(
        state: ColumnProfileState,
        series: pl.Series,
) -> None:
        if state.is_frozen:
            return

        remaining_budget = PROFILE_VALUE_LIMIT - state.values_seen
        if remaining_budget <= 0:
            freeze_profile_state(state, reason="profile limit reached")
            return

        values = series.head(remaining_budget).to_list()

        for value in values:
            state.values_seen += 1

            if value is None:
                    continue

            state.distinct_values.add(value)

            if len(state.distinct_values) > MAX_CATEGORICAL_LEVELS:
                    state.exceeded_categorical_threshold = True
                    freeze_profile_state(state, reason="distinct threshold exceeded")
                    return

        if state.values_seen >= PROFILE_VALUE_LIMIT:
            freeze_profile_state(state, reason="profile limit reached")


def update_profile_states_from_chunk(
        chunk_df: pl.DataFrame,
        profile_states: dict[str, ColumnProfileState],
) -> None:
        for name, state in profile_states.items():
            if state.is_frozen:
                    continue
            if name not in chunk_df.columns:
                    continue

            update_profile_state_from_series(state, chunk_df[name])


def finalize_unfrozen_profile_states(
        profile_states: dict[str, ColumnProfileState],
) -> None:
        for state in profile_states.values():
            if not state.is_frozen:
                    freeze_profile_state(state, reason="forced finalization")

def profile_sav_columns(
        source_infos: dict[str, SourceColumnInfo],
        chunk_size: Number
) -> tuple[dict[str, SourceColumnInfo], dict[str, ColumnProfileState]]:
        
        profile_states = build_profile_states(source_infos)

        profiled_rows = 0
        first_chunk_seen = False

        for chunk_df in read_sav_chunks(path, chunk_size):
            if not first_chunk_seen:
                    update_source_infos_from_chunk(source_infos, chunk_df)
                    first_chunk_seen = True

            update_profile_states_from_chunk(chunk_df, profile_states)
            profiled_rows += chunk_df.height

            if all(state.is_frozen for state in profile_states.values()):
                    break

            if profiled_rows >= PROFILE_VALUE_LIMIT:
                    break

        finalize_unfrozen_profile_states(profile_states)
        return source_infos, profile_states
