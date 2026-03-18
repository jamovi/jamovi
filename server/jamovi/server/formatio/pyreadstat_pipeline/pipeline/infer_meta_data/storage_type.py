
from server.formatio.pyreadstat_pipeline.data_types.data_types import *

def storage_type(meta: PyreadstatMeta, column_name: str) -> SourceStorageType:
    """
    Infer the raw storage type from pyreadstat/readstat metadata.

    Goal:
    - Distinguish physical storage, not meaning.

    Example:
        "double" -> NUMERIC
        "string" -> STRING
    """
    raw_type = getattr(meta, "readstat_variable_types", {}).get(column_name)

    if raw_type == "double":
        return SourceStorageType.NUMERIC
    if raw_type == "string":
        return SourceStorageType.STRING

    return SourceStorageType.UNKNOWN