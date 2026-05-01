from typing import Any
from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import PyreadstatMeta
from jamovi.core import MeasureType


MEASURE_TYPE_BY_NAME = {
    "ordinal": MeasureType.ORDINAL,
    "nominal": MeasureType.NOMINAL,
    "scale": MeasureType.CONTINUOUS,
}


def measure_type(meta: PyreadstatMeta, column_name: str, level_labels: Any) -> MeasureType:
    """
    Infer the statistical measure level from SPSS metadata.

    Example:
        "ordinal" -> ORDINAL
        "nominal" -> NOMINAL
        "scale" -> SCALE
    """
    measures = getattr(meta, "variable_measures", None) or getattr(meta, "variable_measure", {})
    raw_measure = measures.get(column_name)
    
    # if scale w/ levels, treat it as ordinal
    # https://github.com/jamovi/jamovi/issues/487
    if level_labels and raw_measure == 'scale':
        return MeasureType.ORDINAL


    mapped_measure = MEASURE_TYPE_BY_NAME.get(raw_measure)
    if mapped_measure is not None:
        return mapped_measure

    # Legacy compatibility: coded columns with value labels default to ordinal
    return MeasureType.ORDINAL if level_labels else MeasureType.NONE