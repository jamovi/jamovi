import polars as pl

from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import ImportColumn, PyreadstatMeta
from jamovi.server.instancemodel import InstanceModel

from ..infer_metadata.format_type import format_type
from ..infer_metadata.measure_type import measure_type
from ..infer_metadata.missing_ranges import missing_ranges
from ..infer_metadata.column_label import column_label
from ..infer_metadata.variable_width import variable_width
from ..infer_metadata.value_levels import value_levels

def initialize_columns(df: pl.DataFrame, meta: PyreadstatMeta, model: InstanceModel) -> list[ImportColumn]:
    """
    Build a clean internal descriptor for each source column.

    Responsibility:
    - Convert raw pyreadstat metadata into importer-friendly objects
    - Do not mutate values
    - Do not decide jamovi types yet

    Example:
        infos = build_source_column_info(df, meta)
        info = infos["satisfaction"]
    """
    return [_initialize_column(name, df, meta, model) for name in df.columns]


def _initialize_column(name: str, df: pl.DataFrame, meta: PyreadstatMeta, model: InstanceModel) -> ImportColumn:
    """Create and populate one ImportColumn from metadata and model defaults."""
    import_column = ImportColumn(column=model.append_column(name))

    import_column.width = variable_width(meta, name)
    import_column.description = column_label(meta, name, df)

    declared_levels = value_levels(meta, name)
    import_column.state.declared_levels = declared_levels
    import_column.set_measure_type(measure_type(meta, name, declared_levels))

    import_column.source_format = format_type(meta, name)
    missing_ranges(meta, name, import_column)
    return import_column
