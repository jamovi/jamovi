import polars as pl

from server.formatio.pyreadstat_pipeline.data_types.data_types import *

# ============================================================================
# Step 4: Actually normalize the dataframe values
# ============================================================================

def normalize_source_dataframe(
        df: pl.DataFrame,
        ingest_plans: dict[str, ColumnIngestPlan],
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

        for _, plan in ingest_plans.items():
            print('PLAN', plan)
            if plan.cast_to is not None:
                ex: pl.Expr = None
                if plan.preserve_temporal_numeric:
                    ex = pl.col(plan.name).dt.epoch("s").cast(plan.cast_to, strict = False)
                else: 
                    print('PLANNN', plan)
                    ex = pl.col(plan.name).cast(plan.cast_to, strict=False)
                    
                if plan.fill_nulls:
                    ex = ex.fill_null(plan.fill_nulls)

                exprs.append(ex)

        if exprs:
            df = df.with_columns(exprs)

        print('NORMALIZED CHUNK')
        print(df)
        return df