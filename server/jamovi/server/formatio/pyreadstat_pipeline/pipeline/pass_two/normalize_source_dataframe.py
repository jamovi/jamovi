from server.formatio.pyreadstat_pipeline import logger as pipeline_logger

import polars as pl

from server.formatio.pyreadstat_pipeline.data_types.types import *
from jamovi.core import MeasureType

logger = pipeline_logger
_INT_MISSING = -2147483648

def normalize_source_dataframe(
        df: pl.DataFrame,
        columns: list[ImportColumn],
) -> pl.DataFrame:
        """
        Apply ingest plans to the dataframe.

        Responsibility:
        - Perform actual casts / value normalization
        - Keep transformations centralised
        - Do not touch jamovi objects

        Example:
            satisfaction Float64 [1.0, 2.0, 3.0] -> Int64 [1, 2, 3]
        """
        exprs: list[pl.Expr] = []

        for column in columns:
            if _should_pre_encode_labels(column):
                exprs.append(_label_encode_expr(column))
                continue

            final_dtype = column.final_polars_dtype()
            if final_dtype is not None:
                ex: pl.Expr = None
                if column.preserve_temporal_numeric():
                    epoch_unit = "d" if column.source_format == SourceFormatType.DATE else "s"
                    ex = pl.col(column.name).dt.epoch(epoch_unit).cast(final_dtype, strict=False)
                else:
                    ex = pl.col(column.name).cast(final_dtype, strict=False)

                fill_value = column.fill_nulls()
                if fill_value is not False and fill_value is not None:
                    ex = ex.fill_null(pl.lit(fill_value, dtype=final_dtype))

                exprs.append(ex)

        logger.info("normalize_source_dataframe complete columns=%s", len(columns))

        if exprs:
            return df.with_columns(exprs)

        return df


def _should_pre_encode_labels(column: ImportColumn) -> bool:
    """Return True when the column's string labels can be replaced with int codes before writing."""
    return (
        column.data_type is DataType.TEXT
        and column.measure_type is not MeasureType.ID
        and bool(column.state.raw_value_to_code_map)
    )


def _label_encode_expr(column: ImportColumn) -> pl.Expr:
    """Build a Polars expression that maps raw string labels to their integer level codes."""
    code_map = column.state.raw_value_to_code_map
    return (
        pl.col(column.name)
          .replace_strict(
              old=list(code_map.keys()),
              new=list(code_map.values()),
              default=None,
              return_dtype=pl.Int32,
          )
          .fill_null(pl.lit(_INT_MISSING, dtype=pl.Int32))
    )