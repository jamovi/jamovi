from jamovi.server.formatio.pyreadstat_pipeline import logger as pipeline_logger
from typing import Any, Callable, TypeVar
from dataclasses import dataclass
from time import perf_counter

from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import ColumnFinalPlan, ImportColumn, PyreadstatMeta
from jamovi.server.instancemodel import InstanceModel

from .pass_one.initialize_columns import initialize_columns
from .pass_two.normalize_source_dataframe import normalize_source_dataframe
from .pass_two.write_model_values import write_chunk_values
from .pass_two.write_chunk_levels import write_chunk_levels
from .pass_two.value_writer import InstanceModelValueWriter, ValueWriter
from .timing_reporter import PipelineTimingStats, format_pipeline_timing_summary
from .pass_one.profiling import profile_sav_column, initialize_column_profile_states, finalize_unfrozen_profile_states
from .pass_one_finalize.finalize_column_plan import apply_column_runtime_plan, build_column_runtime_plan
from .pass_one_finalize.infer_source_meaning import infer_semantic_column_kind
from .chunk_reader import get_chunk_generator

import polars as pl


logger = pipeline_logger
T = TypeVar('T')


@dataclass
class ImportRunState:
    """Shared state passed between first-pass profiling and second-pass writing."""
    columns: list[ImportColumn]
    column_plans: list[ColumnFinalPlan]
    row_count: int
    chunk_count: int

def _run_with_stage_logging(fn: Callable[[], T], error_message: str, *error_args: Any) -> T:
    """Execute a stage callable and emit structured logging on failure."""
    try:
        return fn()
    except Exception:
        logger.exception(error_message, *error_args)
        raise


def _initialize_first_chunk(chunk_df: pl.DataFrame, meta: PyreadstatMeta, model: InstanceModel) -> list[ImportColumn]:
    """Initialize import columns and profile state from the first data chunk."""
    columns = initialize_columns(chunk_df, meta, model)
    for column in columns:
        column.promote_storage(chunk_df[column.name].dtype)
        column = infer_semantic_column_kind(column)
        initialize_column_profile_states(column)
    return columns


def _profile_chunk(columns: list[ImportColumn], chunk_df: pl.DataFrame, *, update_storage: bool = True) -> None:
    """Update storage and profiling state for each column from a data chunk."""
    for column in columns:
        if update_storage:
            col_dtype = chunk_df[column.name].dtype
            column.promote_storage(col_dtype)
        profile_sav_column(column, chunk_df)


def _profile_all_chunks(path: str, model: InstanceModel, chunk_size: int) -> ImportRunState:
    """Iterate source chunks and produce profiled columns with row/chunk counts."""
    gen = get_chunk_generator(path, chunk_size)

    columns: list[ImportColumn] = []
    row_count = 0
    first_chunk = True
    chunk_count = 0
    for chunk_df, meta in gen:
        chunk_count += 1
        is_first_chunk_iteration = first_chunk
        if first_chunk:
            logger.info("stage=first_pass.initialize_columns status=start chunk=%s", chunk_count)
            initialized = _run_with_stage_logging(
                lambda: _initialize_first_chunk(chunk_df, meta, model),
                "stage=first_pass.initialize_columns status=failed chunk=%s",
                chunk_count,
            )
            columns = initialized
            logger.info("stage=first_pass.initialize_columns status=complete columns=%s", len(columns))
            first_chunk = False

        should_update_storage = not is_first_chunk_iteration
        _run_with_stage_logging(
            lambda: _profile_chunk(columns, chunk_df, update_storage=should_update_storage),
            "stage=first_pass.profile_chunk status=failed chunk=%s",
            chunk_count,
        )

        row_count += chunk_df.height

    return ImportRunState(columns=columns, column_plans=[], row_count=row_count, chunk_count=chunk_count)


def first_pass(path: str,
    model: InstanceModel,
    chunk_size: int,
    timing: PipelineTimingStats | None = None) -> ImportRunState:
    """Profile all chunks and finalize column-level metadata for writing."""
    stage_start = perf_counter()
    logger.info("stage=first_pass status=start path=%s chunk_size=%s", path, chunk_size)
    profile_chunks_start = perf_counter()
    profiled = _run_with_stage_logging(
        lambda: _profile_all_chunks(path, model, chunk_size),
        "stage=first_pass.profile_chunks status=failed",
    )
    profile_chunks_elapsed = perf_counter() - profile_chunks_start
    logger.info("stage=first_pass status=complete rows=%s chunks=%s", profiled.row_count, profiled.chunk_count)

    # Finalize profiling state and build column plans in one pass
    logger.info("stage=first_pass.finalize_columns status=start columns=%s", len(profiled.columns))
    finalize_columns_start = perf_counter()
    finalized_columns = []
    finalized_column_plans: list[ColumnFinalPlan] = []
    for column in profiled.columns:
        finalize_unfrozen_profile_states(column)
        finalized_plan = _run_with_stage_logging(
            lambda c=column: build_column_runtime_plan(c),
            "stage=first_pass.finalize_column status=failed column=%s",
            column.name,
        )

        finalized_column = apply_column_runtime_plan(column, finalized_plan)
        finalized_column_plans.append(finalized_plan)
        finalized_columns.append(finalized_column)
        logger.debug(
            "stage=first_pass.column column=%s final_kind=%s data_type=%s measure_type=%s levels=%s",
            finalized_column.name, finalized_column.state.final_kind, finalized_column.data_type, finalized_column.measure_type,
            len(finalized_column.state.final_level_codes) if finalized_column.state.final_level_codes else 0,
        )

    profiled.columns = finalized_columns
    finalize_columns_elapsed = perf_counter() - finalize_columns_start

    # Finalize row count
    model.set_row_count(profiled.row_count)

    total_elapsed = perf_counter() - stage_start

    if timing is not None:
        timing.first_pass_profile_chunks_seconds = profile_chunks_elapsed
        timing.first_pass_finalize_columns_seconds = finalize_columns_elapsed
        timing.first_pass_total_seconds = total_elapsed
        timing.first_pass_rows = profiled.row_count
        timing.first_pass_chunks = profiled.chunk_count

    return ImportRunState(
        columns=profiled.columns,
        column_plans=finalized_column_plans,
        row_count=profiled.row_count,
        chunk_count=profiled.chunk_count,
    )

def write_normalized_values_pass(
        path: str,
        model: InstanceModel,
        chunk_size: int,
    finalized: ImportRunState,
    timing: PipelineTimingStats | None = None) -> None:
    """Normalize and write chunk values after first-pass metadata finalization."""
    stage_start = perf_counter()
    logger.info("stage=write_normalized_values status=start")
    gen = get_chunk_generator(path, chunk_size)

    # Write levels once before iterating chunks
    write_levels_start = perf_counter()
    write_chunk_levels(finalized.columns, finalized.column_plans)
    write_levels_elapsed = perf_counter() - write_levels_start
    writer = InstanceModelValueWriter(model)

    offset = 0
    chunk_index = 0
    normalize_total = 0.0
    write_total = 0.0
    for chunk_df, _ in gen:
        chunk_index += 1
        chunk_timing = _run_with_stage_logging(
            lambda: _write_chunk(writer, finalized.column_plans, chunk_df, offset),
            "stage=write_normalized_values.chunk status=failed chunk=%s offset=%s",
            chunk_index,
            offset,
        )
        normalize_seconds, write_seconds = chunk_timing
        normalize_total += normalize_seconds
        write_total += write_seconds
        offset += chunk_df.height

    total_elapsed = perf_counter() - stage_start
    logger.info("stage=write_normalized_values status=complete rows=%s chunks=%s", offset, chunk_index)

    if timing is not None:
        timing.write_levels_seconds = write_levels_elapsed
        timing.write_normalize_seconds = normalize_total
        timing.write_values_seconds = write_total
        timing.write_pass_total_seconds = total_elapsed
        timing.write_rows = offset
        timing.write_chunks = chunk_index



def import_sav_to_jamovi_in_chunks(
    path: str,
    model: InstanceModel,
    chunk_size: int
) -> None:
    """Run the full two-pass import pipeline for a SAV file."""
    pipeline_start = perf_counter()
    timing = PipelineTimingStats()

    logger.info("stage=pipeline status=start path=%s", path)
    finalized = _run_with_stage_logging(
        lambda: profile_and_build_levels_pass(path, model, chunk_size, timing=timing),
        "stage=pipeline.profile_and_build_levels status=failed",
    )

    _run_with_stage_logging(
        lambda: write_normalized_values_pass(path, model, chunk_size, finalized, timing=timing),
        "stage=pipeline.write_normalized_values status=failed",
    )

    timing.pipeline_total_seconds = perf_counter() - pipeline_start

    print(format_pipeline_timing_summary(timing))

    logger.info("stage=pipeline status=complete path=%s", path)


def _write_chunk(writer: ValueWriter, column_plans: list[ColumnFinalPlan], chunk_df: pl.DataFrame, offset: int) -> tuple[float, float]:
    """Normalize and write one chunk, returning normalize and write durations."""
    normalize_start = perf_counter()
    normalized_chunk = normalize_source_dataframe(chunk_df, column_plans)
    normalize_elapsed = perf_counter() - normalize_start

    write_start = perf_counter()
    write_chunk_values(writer, column_plans, normalized_chunk, offset)
    write_elapsed = perf_counter() - write_start

    return normalize_elapsed, write_elapsed


# Alias for convenience - profile_and_build_levels_pass is an alias for the full first pass
profile_and_build_levels_pass = first_pass

