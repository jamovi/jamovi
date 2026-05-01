import polars as pl
from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import PyreadstatMeta

def column_label(meta: PyreadstatMeta, column_name: str, df: pl.DataFrame) -> str | None:
    """
    Extract the user-facing variable label, if present.

    pyreadstat often exposes column labels as a list aligned with dataframe columns.
    """
    labels = {}

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