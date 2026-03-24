from typing import Any
from server.formatio.pyreadstat_pipeline.data_types.data_types import *
from jamovi.core import MeasureType


def measure_type(meta: PyreadstatMeta, column_name: str) -> MeasureType:
    """
    Infer the statistical measure level from SPSS metadata.

    Example:
        "ordinal" -> ORDINAL
        "nominal" -> NOMINAL
        "scale" -> SCALE
    """
    raw_measure = getattr(meta, "variable_measure", {}).get(column_name)
    
    match raw_measure:
        case "ordinal": return MeasureType.ORDINAL
        case "nominal": return MeasureType.NOMINAL
        case "scale": return MeasureType.CONTINUOUS

    return MeasureType.NONE