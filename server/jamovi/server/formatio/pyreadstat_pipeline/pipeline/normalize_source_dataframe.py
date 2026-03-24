import polars as pl

from server.formatio.pyreadstat_pipeline.data_types.data_types import *

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
            if column.final_polars_dtype() is not None:
                ex: pl.Expr = None
                if column.preserve_temporal_numeric():
                    ex = pl.col(column.name).dt.epoch("s").cast(column.final_polars_dtype(), strict = False)
                else:
                    ex = pl.col(column.name).cast(column.final_polars_dtype(), strict=False)
                    
                if column.fill_nulls:
                    ex = ex.fill_null(column.fill_nulls())

                exprs.append(ex)
        
        if exprs:
            return df.with_columns(exprs)
        
        return df