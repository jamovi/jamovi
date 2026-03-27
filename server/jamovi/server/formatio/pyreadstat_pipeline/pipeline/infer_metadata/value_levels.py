from server.formatio.pyreadstat_pipeline.data_types.types import PyreadstatMeta

def value_levels(meta: PyreadstatMeta, column_name: str) -> str | None:
    """
    Extract the user-facing variable label, if present.

    pyreadstat often exposes column labels as a list aligned with dataframe columns.
    """

    variable_value_labels = getattr(meta, "variable_value_labels", {})

    return variable_value_labels.get(column_name, {}) or {}