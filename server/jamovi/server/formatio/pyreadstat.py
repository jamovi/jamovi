from __future__ import annotations

import math
import logging
from dataclasses import dataclass, field
from numbers import Number
from collections.abc import Callable, Iterator
from typing import Any

import polars as pl
import pyreadstat

from jamovi.server.dataset import DataType, Column
from jamovi.core import MeasureType
from jamovi.server.instancemodel import InstanceModel

CHUNK_SIZE = 10_000
MAX_LEVELS = 50
INT_MISSING = -2147483648   # jamovi's sentinel value for a missing integer cell
JAMOVI_MAX_BITS = 32        # jamovi stores integer level codes as 32-bit signed ints

logger = logging.getLogger(__name__)


@dataclass
class ColumnInfo:
    """Column metadata and profiling results from the first file scan."""
    name: str
    description: str
    width: int
    source_format: str          # 'date' | 'datetime' | 'time' | 'string' | 'integer' | 'decimal' | 'unknown'
    measure_type: MeasureType   # declared in SPSS metadata
    declared_levels: dict       # raw_value → label from SPSS value labels
    missing_ranges: list        # [{'lo': x, 'hi': y}]
    polars_dtype: pl.DataType = None
    observed_values: list = field(default_factory=list)
    exceeded_max_levels: bool = False
    seen_non_integer_float: bool = False


@dataclass
class DataInfo:
    """Profiling results for the whole file."""
    row_count: int
    columns: list[ColumnInfo]
    weight_variable: str | None = None  # name of the SPSS weight variable, if declared


@dataclass
class ColumnPlan:
    """Resolved write plan for one column."""
    name: str
    data_type: DataType
    measure_type: MeasureType
    missing_values: list[str]
    levels: list | None         # final level codes to write to the column
    code_map: dict | None       # raw_value → int code (text categorical columns only)
    declared_levels: dict       # raw_value → label (for level label lookup)
    source_format: str
    preserve_temporal: bool     # encode dates/times as integer epoch values


def read(data: InstanceModel, path: str, prog_cb: Callable[[float], None], *, format: str, **_) -> None:

    # examine the data
    data_info = profile_data(path)

    # configure the data set and create an import plan
    setup_dataset(data, data_info)
    plan = create_import_plan(data_info)

    # import the data into the data set
    import_data(data, plan, path)

    # Apply frequency weights declared in the SPSS file (matches readstat.py handle_fweight)
    if data_info.weight_variable:
        try:
            weights_analysis = data.analyses.create(id=0, name='weights', ns='jmv')
            weights_analysis.set_weights(data_info.weight_variable)
        except Exception:
            pass


def profile_data(path: str) -> DataInfo:
    """Scan the file in chunks, collecting type and cardinality information."""
    chunks = _open_chunks(path)

    columns: list[ColumnInfo] = []
    distinct: dict[str, dict] = {}  # value → None; insertion order = first encounter order
    row_count = 0
    meta = None

    for chunk, meta in chunks:
        if not columns:
            columns = _init_column_infos(chunk, meta)
            distinct = {c.name: dict() for c in columns}

        row_count += chunk.height

        for col in columns:
            # Numeric (non-text) categoricals: fractional-value check + cardinality.
            # Continuous/ID columns don't use level codes so neither check applies.
            if (not col.seen_non_integer_float
                    and not _is_text_dtype(chunk[col.name].dtype)
                    and col.measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL)):
                s = chunk[col.name].drop_nulls()
                if not s.is_empty():
                    # If any observed value is not close to an integer the column cannot
                    # be represented with integer level codes.  _plan_column will demote
                    # it to DataType.DECIMAL / MeasureType.CONTINUOUS instead.
                    #
                    # We check distance to the *nearest* integer (not just distance to
                    # zero) to tolerate floating-point noise on both sides of an integer
                    # boundary, e.g. 2.0000000001 (frac ≈ 0) or 1.9999999999 (frac ≈ 1).
                    # A value is considered non-integer if its fractional part is more
                    # than 1e-9 away from both 0 and 1.
                    frac = s.cast(pl.Float64) % 1
                    col.seen_non_integer_float = bool(
                        ((frac > 1e-9) & ((1.0 - frac) > 1e-9)).any()
                    )
                # Count distinct values across all chunks.  Exceeding MAX_LEVELS means
                # the column is effectively an identifier rather than a true categorical,
                # so _plan_column will assign MeasureType.ID.
                # maintain_order=True preserves first-encounter order within each chunk,
                # so combined across chunks the ordering matches readstat.py's row-scan order.
                for v in chunk[col.name].drop_nulls().unique(maintain_order=True).to_list():
                    distinct[col.name].setdefault(v, None)
                if len(distinct[col.name]) > MAX_LEVELS:
                    col.exceeded_max_levels = True
                    distinct[col.name] = dict()  # free memory; levels won't be needed

            # Text categoricals also need cardinality tracking and observed-value
            # collection.  High-cardinality text columns (like free-text IDs) become
            # MeasureType.ID; low-cardinality ones (like factor_col) need observed_values
            # populated so that values not covered by declared labels (e.g. "E" in
            # factor_col) can be added as unpinned levels by _build_text_levels.
            elif (_is_text_dtype(chunk[col.name].dtype)
                    and col.measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL)
                    and not col.exceeded_max_levels):
                for v in chunk[col.name].drop_nulls().unique(maintain_order=True).to_list():
                    distinct[col.name].setdefault(str(v), None)
                if len(distinct[col.name]) > MAX_LEVELS:
                    col.exceeded_max_levels = True
                    distinct[col.name] = dict()  # free memory; will be assigned ID

    for col in columns:
        if not col.exceeded_max_levels:
            # Preserve first-encounter order (matches readstat.py behaviour; no sorting)
            col.observed_values = [v for v in distinct[col.name] if v is not None]

    weight_variable = (getattr(meta, 'weight_variable', None) or None) if meta is not None else None
    return DataInfo(row_count=row_count, columns=columns, weight_variable=weight_variable)


def _init_column_infos(chunk: pl.DataFrame, meta: pyreadstat.metadata_container) -> list[ColumnInfo]:
    col_names = chunk.columns
    return [
        ColumnInfo(
            name=name,
            description=_column_description(meta, name, col_names),
            width=_column_width(meta, name),
            source_format=_source_format(meta, name),
            declared_levels=dict(getattr(meta, 'variable_value_labels', {}).get(name) or {}),
            missing_ranges=list(getattr(meta, 'missing_ranges', {}).get(name) or []),
            measure_type=_measure_type(
                meta, name,
                has_levels=bool(getattr(meta, 'variable_value_labels', {}).get(name)),
            ),
            polars_dtype=chunk[name].dtype,
        )
        for name in col_names
    ]


def setup_dataset(data: InstanceModel, data_info: DataInfo) -> None:
    """Set row count and append columns with their basic metadata."""
    data.set_row_count(data_info.row_count)
    for col in data_info.columns:
        column = data.append_column(col.name)
        column.description = col.description
        column.width = col.width


# create_import_plan

def create_import_plan(data_info: DataInfo) -> list[ColumnPlan]:
    """Determine final types, levels, and normalisation rules for each column."""
    return [_plan_column(col) for col in data_info.columns]


def _plan_column(col: ColumnInfo) -> ColumnPlan:
    # SPSS stores dates and times as floating-point offsets from an internal
    # epoch.  We convert them to integer epoch values (days for dates, seconds
    # for times and datetimes) so jamovi can store and display them without loss.
    # DataType.INTEGER is used for all temporal types regardless of the
    # underlying float representation.
    #
    # Datetime columns become CONTINUOUS because a timestamp on a number line
    # has no natural ordering into discrete categories.  Date and time-of-day
    # columns become ORDINAL: they are ordered but treated as discrete levels
    # (calendar dates, clock times) rather than arbitrary measurements.
    if col.source_format in ('date', 'datetime', 'time'):
        measure = MeasureType.CONTINUOUS if col.source_format == 'datetime' else MeasureType.ORDINAL
        return ColumnPlan(
            name=col.name,
            data_type=DataType.INTEGER,
            measure_type=measure,
            missing_values=[],
            levels=None, code_map=None, declared_levels={},
            source_format=col.source_format,
            preserve_temporal=True,
        )

    is_text = _is_text_dtype(col.polars_dtype)
    is_categorical = col.measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL)

    # When a nominal or ordinal column has more than MAX_LEVELS distinct values
    # it is almost certainly an identifier (participant ID, free-text response,
    # etc.) rather than a true categorical variable.  Assigning MeasureType.ID
    # prevents jamovi from building an oversized level table and signals that
    # the column should be treated as a label rather than a grouping factor.
    if col.exceeded_max_levels and is_categorical:
        data_type = DataType.TEXT if is_text else DataType.INTEGER
        return ColumnPlan(
            name=col.name,
            data_type=data_type,
            measure_type=MeasureType.ID,
            missing_values=_render_missing(col),
            levels=None, code_map=None, declared_levels={},
            source_format=col.source_format,
            preserve_temporal=False,
        )

    # jamovi encodes nominal/ordinal columns with integer level codes.  If any
    # observed value has a non-zero fractional part (e.g. 1.5) it cannot be
    # mapped to an integer code without data loss.  We demote such columns to
    # DataType.DECIMAL / MeasureType.CONTINUOUS rather than silently truncating.
    if is_categorical and not is_text and col.seen_non_integer_float:
        return ColumnPlan(
            name=col.name,
            data_type=DataType.DECIMAL,
            measure_type=MeasureType.CONTINUOUS,
            missing_values=_render_missing(col),
            levels=None, code_map=None, declared_levels={},
            source_format=col.source_format,
            preserve_temporal=False,
        )

    # jamovi stores all categorical columns (nominal and ordinal) as integer
    # codes paired with a level table.  String-valued categoricals require an
    # explicit string→code mapping: _build_text_levels assigns each distinct
    # string an ascending integer starting from 0.  DataType.TEXT tells jamovi
    # to look up display values in the level table rather than rendering the
    # integer directly.  The measure type (NOMINAL or ORDINAL) is preserved from
    # the SPSS metadata.
    if is_categorical and is_text:
        levels, code_map = _build_text_levels(col)
        return ColumnPlan(
            name=col.name,
            data_type=DataType.TEXT,
            measure_type=col.measure_type,
            missing_values=_render_missing(col),
            levels=levels,
            code_map=code_map,
            declared_levels=col.declared_levels,
            source_format=col.source_format,
            preserve_temporal=False,
        )

    # For numeric nominal/ordinal columns the raw values become the level codes
    # directly (no remapping needed).  DataType.INTEGER is the normal choice.
    #
    # If any level code exceeds 32-bit signed range, jamovi cannot store it as
    # an integer.  The fallback mirrors readstat.py's two-path behaviour:
    #  - Labels declared upfront in SPSS metadata: switch to DataType.TEXT so
    #    the declared labels are preserved (matches readstat.py handle_variable).
    #  - No declared labels (codes discovered purely at runtime): demote to
    #    DataType.DECIMAL / MeasureType.CONTINUOUS, discarding level structure
    #    (matches readstat.py handle_value runtime path).
    if is_categorical:
        level_values = _build_numeric_levels(col)
        too_wide = any(_bits_required(v) > JAMOVI_MAX_BITS for v in level_values if v is not None)
        if too_wide and not col.declared_levels:
            # No declared labels and values too wide for integer codes:
            # treat as a continuous variable (no meaningful level structure)
            return ColumnPlan(
                name=col.name,
                data_type=DataType.DECIMAL,
                measure_type=MeasureType.CONTINUOUS,
                missing_values=_render_missing(col),
                levels=None, code_map=None, declared_levels={},
                source_format=col.source_format,
                preserve_temporal=False,
            )
        data_type = DataType.TEXT if too_wide else DataType.INTEGER
        return ColumnPlan(
            name=col.name,
            data_type=data_type,
            measure_type=col.measure_type,
            missing_values=_render_missing(col),
            levels=level_values,
            code_map=None,
            declared_levels=col.declared_levels,
            source_format=col.source_format,
            preserve_temporal=False,
        )

    # A string column that SPSS did not declare as nominal or ordinal (e.g. an
    # open-ended response field).  There are no levels to build; MeasureType.NOMINAL
    # is the most defensible default for unordered text that is not an identifier.
    if is_text:
        return ColumnPlan(
            name=col.name,
            data_type=DataType.TEXT,
            measure_type=MeasureType.NOMINAL,
            missing_values=_render_missing(col),
            levels=None, code_map=None, declared_levels={},
            source_format=col.source_format,
            preserve_temporal=False,
        )

    # Numeric columns that are not nominal or ordinal: straightforward continuous
    # variables.  The polars dtype determines precision: Float32/Float64 become
    # DataType.DECIMAL; integer polars dtypes become DataType.INTEGER.
    data_type = DataType.DECIMAL if col.polars_dtype in (pl.Float32, pl.Float64) else DataType.INTEGER
    return ColumnPlan(
        name=col.name,
        data_type=data_type,
        measure_type=MeasureType.CONTINUOUS,
        missing_values=_render_missing(col),
        levels=None, code_map=None, declared_levels={},
        source_format=col.source_format,
        preserve_temporal=False,
    )


def import_data(data: InstanceModel, plan: list[ColumnPlan], path: str) -> None:
    """Apply the import plan: configure columns, write levels, then write values."""
    for p in plan:
        column = data.get_column_by_name(p.name)
        column.change(data_type=p.data_type, measure_type=p.measure_type)
        if p.missing_values:
            column.set_missing_values(p.missing_values)
        if p.levels is not None:
            _write_levels(column, p)

    row_offset = 0
    for chunk, _ in _open_chunks(path):
        normalized = _normalize_chunk(chunk, plan)
        column_refs = [p.name for p in plan]
        values = [normalized[p.name] for p in plan]
        try:
            data.set_values_initing(column_refs, row_offset, values)
        except AttributeError:
            data.set_values(column_refs, row_offset, values)
        row_offset += chunk.height

    # Infer displayed decimal places for DECIMAL columns so that the UI shows
    # an appropriate number of digits.  We do not downgrade DECIMAL to INTEGER
    # even when all values are whole numbers: SPSS scale/continuous columns are
    # always floating-point and the test expectations reflect that.
    for p in plan:
        if p.data_type == DataType.DECIMAL:
            column = data.get_column_by_name(p.name)
            column.determine_dps()


def _write_levels(column: Column, plan: ColumnPlan) -> None:
    written: set = set()

    if plan.code_map:
        # Text categorical: code_map maps raw_value → integer code
        for raw, code in plan.code_map.items():
            if code in written:
                continue
            written.add(code)
            label = _declared_label(plan, raw) or _format_label(raw)
            pinned = _is_declared(plan, raw)
            column.append_level(int(code), label, str(raw), pinned=pinned)
    else:
        # Numeric categorical: level codes are the raw values
        for code in (plan.levels or []):
            if code is None or code in written:
                continue
            written.add(code)
            label = _declared_label(plan, code) or _format_label(code)
            pinned = _is_declared(plan, code)
            column.append_level(int(code), label, str(code), pinned=pinned)


def _normalize_chunk(chunk: pl.DataFrame, plan: list[ColumnPlan]) -> pl.DataFrame:
    """Cast and encode each column according to its plan."""
    exprs = []
    for p in plan:
        if p.preserve_temporal:
            # Convert the polars Date/Datetime/Duration value to a plain integer
            # epoch offset.  jamovi stores dates as days-since-epoch and times as
            # seconds-since-midnight, both as Int32.  Nulls become INT_MISSING.
            epoch_unit = 'd' if p.source_format == 'date' else 's'
            ex = (
                pl.col(p.name).dt.epoch(epoch_unit)
                    .cast(pl.Int32, strict=False)
                    .fill_null(pl.lit(INT_MISSING, dtype=pl.Int32))
            )
        elif p.code_map:
            # Text categorical: replace each string value with the integer code
            # assigned by _build_text_levels.  Values not in the map (e.g.
            # unexpected strings) become null and then INT_MISSING.
            ex = (
                pl.col(p.name)
                    .replace_strict(
                        old=list(p.code_map.keys()),
                        new=list(p.code_map.values()),
                        default=None,
                        return_dtype=pl.Int32,
                    )
                    .fill_null(pl.lit(INT_MISSING, dtype=pl.Int32))
            )
        elif p.levels is not None:
            # Numeric categorical: the raw values are already the level codes;
            # just cast to Int32 and replace nulls with the jamovi missing sentinel.
            ex = (
                pl.col(p.name)
                    .cast(pl.Int32, strict=False)
                    .fill_null(pl.lit(INT_MISSING, dtype=pl.Int32))
            )
        elif p.data_type == DataType.DECIMAL:
            ex = pl.col(p.name).cast(pl.Float64, strict=False)
        elif p.data_type == DataType.INTEGER:
            ex = pl.col(p.name).cast(pl.Int32, strict=False)
        else:
            # DataType.TEXT: polars already holds the column as a String series;
            # jamovi's value writer accepts strings directly, so no cast is needed.
            ex = pl.col(p.name)
        exprs.append(ex)
    return chunk.with_columns(exprs)


def _source_format(meta: pyreadstat.metadata_container, name: str) -> str:
    """Collapse the SPSS format string into a small family name."""
    fmt = (getattr(meta, 'original_variable_types', {}).get(name) or '').upper()
    if not fmt:
        return 'unknown'
    if fmt.startswith('DATETIME') or fmt.startswith('YMDHMS'):
        return 'datetime'
    if fmt.startswith(('DATE', 'ADATE', 'EDATE', 'JDATE', 'SDATE', 'QYR', 'YRMO', 'MONTH', 'WKDAY', 'WKYR')):
        return 'date'
    if fmt.startswith(('TIME', 'DTIME')):
        return 'time'
    if fmt.startswith('A'):
        return 'string'
    if fmt.startswith(('E', 'F', 'COMMA', 'DOT')):
        return 'integer' if fmt.endswith('.0') else 'decimal'
    return 'integer'


def _measure_type(meta: pyreadstat.metadata_container, name: str, has_levels: bool) -> MeasureType:
    """Infer the statistical measure level from SPSS metadata."""
    # pyreadstat uses 'variable_measure' (singular), not 'variable_measures'
    raw = (getattr(meta, 'variable_measure', None) or {}).get(name)
    # Special case: SPSS allows a "scale" variable to carry value labels
    # (e.g. a Likert item declared as scale but with labels 1=Disagree…5=Agree).
    # jamovi treats any column with declared levels as categorical, so we promote
    # scale+labels to ORDINAL to preserve those definitions; treating it as
    # CONTINUOUS would discard the labels entirely.
    if has_levels and raw == 'scale':
        return MeasureType.ORDINAL
    return {
        'ordinal': MeasureType.ORDINAL,
        'nominal': MeasureType.NOMINAL,
        'scale':   MeasureType.CONTINUOUS,
        # No declared measure or unrecognised value:
        # - if levels exist, ORDINAL is the safest default (ordered categories)
        # - otherwise, NOMINAL
    }.get(raw, MeasureType.ORDINAL if has_levels else MeasureType.NOMINAL)


def _column_description(meta: pyreadstat.metadata_container, name: str, col_names: list[str]) -> str:
    labels = getattr(meta, 'column_labels', None)
    if not labels:
        return ''
    try:
        idx = col_names.index(name)
    except ValueError:
        return ''
    return labels[idx] or '' if idx < len(labels) else ''


def _column_width(meta: pyreadstat.metadata_container, name: str) -> int:
    w = getattr(meta, 'variable_display_width', {}).get(name, 0) * 12
    if w == 0:
        return 100
    return max(w, 32)


def _build_numeric_levels(col: ColumnInfo) -> list[Any]:
    """Build level codes from declared then observed values."""
    seen: set = set()
    levels = []

    source = list(col.declared_levels.keys()) or col.observed_values
    for v in source:
        if v is None or v in seen:
            continue
        seen.add(v)
        levels.append(int(v) if isinstance(v, float) and v.is_integer() else v)

    return levels


def _build_text_levels(col: ColumnInfo) -> tuple[list[int], dict[str, int]]:
    """Map distinct string values to ascending integer codes."""
    seen: set = set()
    raw_values: list[str] = []

    # Declared levels come first: they are "pinned" in jamovi (explicitly authored
    # in the SPSS file) and their ordering must be preserved.
    for v in col.declared_levels.keys():
        s = str(v) if v is not None else None
        if s is None or s == '' or s in seen:
            continue
        seen.add(s)
        raw_values.append(s)

    # Any values observed in the data that were not covered by a declared label
    # are appended as unpinned levels (e.g. "E" in a column whose labels only
    # define A, B, C, D).  This matches readstat.py's handle_value behaviour.
    for v in col.observed_values:
        s = str(v) if v is not None else None
        if s is None or s == '' or s in seen:
            continue
        seen.add(s)
        raw_values.append(s)

    code_map = {v: i for i, v in enumerate(raw_values)}
    return list(range(len(raw_values))), code_map


def _missing_value_set(col: ColumnInfo) -> set[Any]:
    """Collect the set of exact values declared as missing."""
    missings: set = set()
    for entry in col.missing_ranges:
        lo, hi = entry.get('lo'), entry.get('hi')
        if lo == hi:
            missings.add(lo)
    return missings


def _render_missing(col: ColumnInfo) -> list[str]:
    """Render missing ranges into jamovi missing-value rule strings."""
    MAX_EXPAND = 12
    INT_MAX = 2_147_483_647
    INT_MIN = -2_147_483_647
    missings = []

    for entry in col.missing_ranges:
        lo, hi = entry.get('lo'), entry.get('hi')

        if isinstance(lo, str) or isinstance(hi, str):
            if lo == hi:
                missings.append(f"== '{lo}'")
            else:
                missings.extend([f"== '{lo}'", f"== '{hi}'"])
            continue

        if not isinstance(lo, Number) or not isinstance(hi, Number):
            continue

        if lo == hi:
            missings.append(f"== {lo}")
            continue

        high = int(hi) if math.isfinite(hi) else INT_MAX
        low  = int(lo) if math.isfinite(lo) else INT_MIN

        if abs(high - low) <= MAX_EXPAND:
            missings.extend(f"== {i}" for i in range(low, high + 1))
        else:
            missings.append(f"<= {hi}" if abs(hi) < abs(lo) else f">= {lo}")

    return missings


def _open_chunks(path: str) -> Iterator[tuple[pl.DataFrame, pyreadstat.metadata_container]]:
    # user_missing=True keeps SPSS user-defined missing values as their original
    # numeric or string values rather than replacing them with NaN.  This lets
    # _render_missing() declare them as missing to jamovi at import time, keeping
    # the raw values visible in the data so downstream analyses can apply the
    # missing-value filter themselves.
    return pyreadstat.read_file_in_chunks(
        pyreadstat.read_sav,
        path,
        chunksize=CHUNK_SIZE,
        offset=0,
        output_format='polars',
        user_missing=True,
    )


def _is_text_dtype(dtype: pl.DataType) -> bool:
    return dtype in (pl.Utf8, pl.String) if hasattr(pl, 'String') else dtype == pl.Utf8


def _bits_required(v: Any) -> int:
    try:
        return int(v).bit_length()
    except (TypeError, ValueError, OverflowError):
        return 0


def _declared_label(plan: ColumnPlan, raw: Any) -> str | None:
    d = plan.declared_levels
    if raw in d:
        return d[raw]
    s = str(raw)
    for k, v in d.items():
        if str(k) == s:
            return v
    return None


def _is_declared(plan: ColumnPlan, raw: Any) -> bool:
    return _declared_label(plan, raw) is not None


def _format_label(v: Any) -> str:
    if isinstance(v, bool):
        return 'Yes' if v else 'No'
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)
