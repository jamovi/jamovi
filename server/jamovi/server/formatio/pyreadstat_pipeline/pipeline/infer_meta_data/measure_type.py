from typing import Any
from server.formatio.pyreadstat_pipeline.data_types.data_types import *


def measure_type(meta: PyreadstatMeta, column_name: str) -> SourceMeasureType:
    """
    Infer the statistical measure level from SPSS metadata.

    Example:
        "ordinal" -> ORDINAL
        "nominal" -> NOMINAL
        "scale" -> SCALE
    """
    raw_measure = getattr(meta, "variable_measure", {}).get(column_name)

    if raw_measure == "nominal":
        return SourceMeasureType.NOMINAL
    if raw_measure == "ordinal":
        return SourceMeasureType.ORDINAL
    if raw_measure == "scale":
        return SourceMeasureType.SCALE

    return SourceMeasureType.UNKNOWN

