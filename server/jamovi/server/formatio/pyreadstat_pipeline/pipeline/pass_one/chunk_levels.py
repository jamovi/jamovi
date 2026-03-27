import polars as pl


def get_unique_values_from_chunk(name: str, df_chunk: pl.DataFrame) -> pl.DataFrame:
    """Extract non-null unique values for one column from a chunk."""
    return df_chunk.select(
        pl.col(name)
            .drop_nulls()
            .unique()
            .alias(name)
    )
