from jamovi.server.formatio.pyreadstat_pipeline import logger as pipeline_logger

import polars as pl

from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import ColumnFinalPlan, DataType, SourceFormatType
from jamovi.core import MeasureType

logger = pipeline_logger
_INT_MISSING = -2147483648

def normalize_source_dataframe(
        df: pl.DataFrame,
    column_plans: list[ColumnFinalPlan],
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

        for plan in column_plans:
            should_pre_encode = _should_pre_encode_labels(plan)
            logger.debug(
                "normalize: column=%s data_type=%s measure_type=%s pre_encode=%s final_dtype=%s",
                plan.name, plan.data_type, plan.measure_type, should_pre_encode, plan.final_polars_dtype
            )
            
            if should_pre_encode:
                logger.debug("  -> adding _label_encode_expr for %s", plan.name)
                exprs.append(_label_encode_expr(plan))
                continue

            # Apply data type conversion
            final_dtype = plan.final_polars_dtype
            if final_dtype is not None:
                logger.debug("  -> adding cast expr to %s for %s", final_dtype, plan.name)
                ex: pl.Expr = None
                
                # For INTEGER columns with NOMINAL/ORDINAL, ensure we convert float to int first
                if (plan.data_type == DataType.INTEGER 
                    and plan.measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL)):
                    logger.debug("     -> explicitly casting %s nominal/ordinal to Int32", plan.name)
                    ex = pl.col(plan.name).cast(pl.Int32, strict=False)
                    fill_value = plan.fill_null_value
                    if fill_value is not None:
                        ex = ex.fill_null(pl.lit(fill_value, dtype=pl.Int32))
                elif plan.preserve_temporal_numeric:
                    epoch_unit = "d" if plan.source_format == SourceFormatType.DATE else "s"
                    ex = pl.col(plan.name).dt.epoch(epoch_unit).cast(final_dtype, strict=False)
                    fill_value = plan.fill_null_value
                    if fill_value is not None:
                        ex = ex.fill_null(pl.lit(fill_value, dtype=final_dtype))
                else:
                    ex = pl.col(plan.name).cast(final_dtype, strict=False)
                    fill_value = plan.fill_null_value
                    if fill_value is not None:
                        ex = ex.fill_null(pl.lit(fill_value, dtype=final_dtype))

                exprs.append(ex)
            else:
                logger.debug("  -> SKIPPING column %s (no final_dtype)", plan.name)

        logger.info("normalize_source_dataframe complete columns=%s exprs=%s", len(column_plans), len(exprs))

        if exprs:
            result = df.with_columns(exprs)
            logger.debug("normalized dtypes: %s", {name: str(result[name].dtype) for name in [p.name for p in column_plans]})
            return result

        return df


def _should_pre_encode_labels(column: ColumnFinalPlan) -> bool:
    """Return True when the column's labels need to be replaced with int codes before writing."""
    # TEXT columns with level encoding need value->code mapping
    if (column.data_type == DataType.TEXT
        and column.measure_type != MeasureType.ID
        and bool(column.raw_value_to_code_map)):
        return True
    
    # INTEGER/DECIMAL columns with nominal/ordinal need to be cast to int
    if (column.data_type in (DataType.INTEGER, DataType.DECIMAL)
        and column.measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL)):
        return True
    
    return False


def _label_encode_expr(column: ColumnFinalPlan) -> pl.Expr:
    """Build a Polars expression that maps raw labels to their integer level codes."""
    # For TEXT columns with raw_value_to_code_map, use direct value replacement
    if column.data_type == DataType.TEXT and column.raw_value_to_code_map:
        logger.debug("  _label_encode_expr TEXT column %s: mapping %d values to codes", 
                     column.name, len(column.raw_value_to_code_map))
        code_map = column.raw_value_to_code_map
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
    
    # For numeric (INTEGER or DECIMAL) columns with nominal/ordinal, cast to int
    if column.data_type in (DataType.INTEGER, DataType.DECIMAL) and column.measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL):
        logger.debug("  _label_encode_expr numeric column %s: casting %s -> Int32", 
                     column.name, column.data_type)
        return (
            pl.col(column.name)
              .cast(pl.Int32, strict=False)
              .fill_null(pl.lit(_INT_MISSING, dtype=pl.Int32))
        )
    
    # Fallback: shouldn't reach here
    logger.warning("  _label_encode_expr: unexpected column %s data_type=%s measure_type=%s",
                   column.name, column.data_type, column.measure_type)
    return pl.col(column.name)