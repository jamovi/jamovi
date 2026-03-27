import polars as pl
from server.formatio.pyreadstat_pipeline.data_types.types import *

def column_label(meta: PyreadstatMeta, column_name: str, df: pl.DataFrame) -> str | None:
    """
    Extract the user-facing variable label, if present.

    pyreadstat often exposes column labels as a list aligned with dataframe columns.
    """
    labels = {}

    # if use_values_for_labels:
    #     i = 0
    #     for i, value in enumerate(df[column_name]):
    #         labels.append(i, value) 
    #     return labels

    labels = getattr(meta, "column_labels", None)
    if not labels:
        return ""

    try:
        index = df.columns.index(column_name)
    except ValueError:
        return ""

    if index >= len(labels):
        return ""

    return labels[index] or ""