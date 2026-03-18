import polars as pl
from server.formatio.pyreadstat_pipeline.data_types.data_types import *

def variable_label(meta: PyreadstatMeta, column_name: str, df: pl.DataFrame) -> str | None:
    """
    Extract the user-facing variable label, if present.

    pyreadstat often exposes column labels as a list aligned with dataframe columns.
    """
    labels = getattr(meta, "column_labels", None)
    if not labels:
        return None

    try:
        index = df.columns.index(column_name)
    except ValueError:
        return None

    if index >= len(labels):
        return None

    return labels[index]