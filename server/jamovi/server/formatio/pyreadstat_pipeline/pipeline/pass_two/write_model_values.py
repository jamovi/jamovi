import polars as pl
from server.formatio.pyreadstat_pipeline import logger as pipeline_logger
from server.formatio.pyreadstat_pipeline.data_types.types import ColumnFinalPlan
from .value_writer import ValueWriter


logger = pipeline_logger

def write_chunk_values(
    writer: ValueWriter,
    column_plans: list[ColumnFinalPlan],
    chunk_df: pl.DataFrame,
    row_offset: int,
) -> None:
    """Write one normalized chunk into the configured storage writer."""
    assert isinstance(chunk_df, pl.DataFrame)
    column_refs, column_values = _build_chunk_payload(column_plans, chunk_df)

    logger.debug(
        "write_chunk_values row_offset=%s rows=%s columns=%s",
        row_offset,
        len(chunk_df),
        len(column_plans),
    )

    writer.write_values(column_refs, row_offset, column_values)


def _build_chunk_payload(columns: list[ColumnFinalPlan], chunk_df: pl.DataFrame) -> tuple[list[int] | list[str], list[pl.Series]]:
    """Build column refs and aligned Series payload for a chunk write."""
    column_names = [c.name for c in columns]
    column_refs = _get_column_refs(columns)
    column_values = [chunk_df.get_column(name) for name in column_names]
    return column_refs, column_values


def _get_column_refs(columns: list[ColumnFinalPlan]) -> list[int] | list[str]:
    """Return index refs when all are available, otherwise fallback to names."""
    refs: list[int] = []
    for column in columns:
        column_index = column.index
        if not isinstance(column_index, int):
            return [c.name for c in columns]
        refs.append(column_index)
    return refs


