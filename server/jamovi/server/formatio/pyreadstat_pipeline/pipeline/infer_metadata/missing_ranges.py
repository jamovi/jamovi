import math
from numbers import Number
from typing import Any
from server.formatio.pyreadstat_pipeline.data_types.types import ImportColumn, PyreadstatMeta
from jamovi.server.dataset import DataType


MAX_EXPANDED_RANGE = 12
INT_MAX = 2147483647
INT_MIN = -2147483647


def missing_ranges(meta: PyreadstatMeta, column_name: str, column: ImportColumn) -> list[str]:
    """Attach declared missing ranges to state and return rendered rules."""
    range_list = getattr(meta, "missing_ranges", {}).get(column_name)
    column.state.declared_missing_ranges = list(range_list or [])

    return render_missing_ranges(column)


def render_missing_ranges(column: ImportColumn) -> list[str]:
    """Render missing range metadata into jamovi missing-value expressions."""
    range_list = column.state.declared_missing_ranges
    if not range_list:
        return []

    missings = []
    for entry in range_list:
        lo, hi = entry.get('lo'), entry.get('hi')

        if isinstance(lo, str) or isinstance(hi, str):
            missings.extend(_string_missing_rules(lo, hi))
            continue

        if not isinstance(lo, Number) or not isinstance(hi, Number):
            continue

        missings.extend(_numeric_missing_rules(lo, hi, column.data_type))

    return missings


def _string_missing_rules(lo: Any, hi: Any) -> list[str]:
    """Build equality rules for string-based missing value bounds."""
    if lo == hi:
        return [f"== '{lo}'"]
    return [f"== '{lo}'", f"== '{hi}'"]


def _numeric_missing_rules(lo: Number, hi: Number, data_type: DataType) -> list[str]:
    """Build numeric missing rules, expanding short integer ranges when safe."""
    if lo == hi:
        return [f"== {lo}"]

    if data_type == DataType.INTEGER:
        high = int(hi) if math.isfinite(hi) else INT_MAX
        low = int(lo) if math.isfinite(lo) else INT_MIN
        if abs(high - low) > MAX_EXPANDED_RANGE:
            return [_bound_closest_to_zero_rule(low, high)]
        return [f"== {i}" for i in range(low, high + 1)]

    return [_bound_closest_to_zero_rule(lo, hi)]


def _bound_closest_to_zero_rule(lo: Number, hi: Number) -> str:
    """Choose a bound rule nearest zero when a range should not be expanded."""
    return f"<= {hi}" if abs(hi) < abs(lo) else f">= {lo}"