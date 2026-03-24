import math
from numbers import Number
from server.formatio.pyreadstat_pipeline.data_types.data_types import *


def missing_ranges(meta: PyreadstatMeta, column_name: str, column: Column):
    
    range_list = getattr(meta, "missing_ranges", {}).get(column_name)
    missings = []

    if range_list is None:
        return missings

    for entry in range_list:
        lo, hi = entry.get('lo'), entry.get('hi')

        # Handle strings (SAS/SPSS discrete missing values)
        if isinstance(lo, str) or isinstance(hi, str):
            if lo == hi:
                missings.append(f"== '{lo}'")
            else:
                missings.extend([f"== '{lo}'", f"== '{hi}'"])
            continue

        # Skip if both are None or non-numeric at this point
        if not isinstance(lo, Number) or not isinstance(hi, Number):
            continue

        if lo == hi:
            missings.append(f"== {lo}")
        elif column.is_numeric() and math.isfinite(lo) and math.isfinite(hi) and abs(hi - lo) <= 12:
            # Expand small integer ranges into individual equality checks
            for i in range(int(lo), int(hi) + 1):
                missings.append(f"== {i}")
        else:
            # For large ranges or floats, pick the bound closest to zero 
            # (Assumes missing codes are usually negative or extreme)
            if abs(hi) < abs(lo):
                missings.append(f"<= {hi}")
            else:
                missings.append(f">= {lo}")

    return missings