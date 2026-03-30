from dataclasses import dataclass, field
import math
from numbers import Number
from typing import Any, Protocol, TypedDict, Dict, List, Union
from enum import Enum, auto
import polars as pl
from jamovi.server.dataset import Column
from jamovi.server.dataset import DataType
from jamovi.core import MeasureType


JAMOVI_MAX_BITS = 32
STORAGE_ORDER = {
    DataType.INTEGER: 0,
    DataType.DECIMAL: 1,
    DataType.TEXT: 2,
}
POLARS_DTYPE_BY_DATA_TYPE = {
    DataType.INTEGER: pl.Int32,
    DataType.DECIMAL: pl.Float64,
}

class SourceFormatType(Enum):
    UNKNOWN = auto()

    NUMERIC_INTEGER = auto()
    NUMERIC_DECIMAL = auto()

    STRING = auto()

    DATE = auto()
    TIME = auto()
    DATETIME = auto()

    CURRENCY = auto()
    PERCENT = auto()
    SCIENTIFIC = auto()

class SemanticColumnKind(Enum):
    UNKNOWN = auto()

    TEXT = auto()
    CONTINUOUS = auto()

    NOMINAL_CODED = auto()
    ORDINAL_CODED = auto()

    DATE = auto()
    TIME = auto()
    DATETIME = auto()

    ID = auto()

    # provisional states used before profiling is complete
    TEXT_CANDIDATE = auto()
    NOMINAL_CANDIDATE = auto()


TEMPORAL_SOURCE_FORMATS = {
    SourceFormatType.DATE,
    SourceFormatType.TIME,
    SourceFormatType.DATETIME,
}
PROFILE_KINDS = {
    SemanticColumnKind.TEXT_CANDIDATE,
    SemanticColumnKind.NOMINAL_CANDIDATE,
    SemanticColumnKind.TEXT,  # plain TEXT cols need profiling to detect ID
}


@dataclass(frozen=True)
class ColumnFinalPlan:
    """Immutable finalized write plan produced after pass-one profiling."""

    name: str
    index: int | None

    source_format: SourceFormatType | None
    semantic_kind: SemanticColumnKind | None

    data_type: DataType
    measure_type: MeasureType
    missing_values: list[str]

    declared_levels: dict[Any, str] | None
    final_level_codes: list[Any] | None
    raw_value_to_code_map: dict[Any, int] | None

    final_polars_dtype: pl.DataType
    preserve_temporal_numeric: bool
    fill_null_value: Any | None


@dataclass
class ColumnPipelineState:
    source_format: SourceFormatType = None
    final_kind: SemanticColumnKind = None

    # profile states
    is_profiling_complete: bool = False
    exceeded_cardinality_limit: bool = False
    profiling_complete_reason: str | None = None
    
    # declared levels from metadata (e.g. SPSS value labels) - used for validation and level ordering, but not guaranteed to be complete
    # is a dictionary mapping raw values to labels, or None if no declared levels
    declared_levels: dict[Any, str] | None = None
    observed_values: set[Any] = field(default_factory=set)
    declared_missing_ranges: list['MissingRangeEntry'] = field(default_factory=list)

    # pipeline-managed level state
    observed_distinct_value_chunks: list[pl.DataFrame] = field(default_factory=list)
    final_level_codes: list[Any] | None = None
    raw_value_to_code_map: dict[Any, int] | None = None
    
    # running state for integer-like check
    seen_non_integer_float: bool = False

    def is_missing_level_value(self, value: Any) -> bool:
        """Return whether a value is covered by the declared missing rules."""
        if value is None:
            return True

        for entry in self.declared_missing_ranges:
            lo = entry.get('lo')
            hi = entry.get('hi')

            if isinstance(value, str):
                if (isinstance(lo, str) and lo == value) or (isinstance(hi, str) and hi == value):
                    return True
                continue

            if not isinstance(value, Number):
                continue

            if isinstance(value, float) and math.isnan(value):
                continue

            if not isinstance(lo, Number) or not isinstance(hi, Number):
                continue

            if lo <= value <= hi:
                return True

        return False

    def are_all_values_integer_like(self) -> bool:
        """True if no non-integer float values were seen during profiling."""
        return not self.seen_non_integer_float

    def check_chunk_for_non_integer_floats(self, chunk_df: pl.DataFrame, column_name: str) -> None:
        """Flag the state once a non-integer float is observed in a chunk."""
        if self.seen_non_integer_float:
            return

        non_null_series = chunk_df.select(pl.col(column_name).drop_nulls())
        if non_null_series.is_empty():
            return

        has_non_integer = non_null_series.select(
            (pl.col(column_name) % 1 != 0).any()
        ).item()
        if has_non_integer:
            self.seen_non_integer_float = True

PIPELINE_STATE_FIELDS = set(ColumnPipelineState.__dataclass_fields__)


@dataclass
class ImportColumn:
    column: Column
    state: ColumnPipelineState = field(default_factory=ColumnPipelineState)

    def __getattr__(self, name: str) -> Any:
        """Resolve pipeline state fields first, then delegate to wrapped Column."""
        if name in PIPELINE_STATE_FIELDS:
            return getattr(self.state, name)
        return getattr(self.column, name)
    
    def __setattr__(self, name: str, value: Any) -> None:
        """Route pipeline-owned fields to state and delegate others to wrapped Column."""
        if name in {'column', 'state'}:
            super().__setattr__(name, value)
            return

        if name in PIPELINE_STATE_FIELDS:
            setattr(self.state, name, value)
            return

        if hasattr(self.column, name):
            setattr(self.column, name, value)
            return

        super().__setattr__(name, value)

    def is_numeric(self):
        """Return whether the wrapped column uses a numeric storage type."""
        return self.data_type in {DataType.DECIMAL, DataType.INTEGER}

    def is_any_label_bits_too_wide(self):
        """Check if any finalized level value exceeds jamovi integer bit limits."""
        if self.state.final_level_codes is not None:
            for value in self.state.final_level_codes:
                if isinstance(value, Number) and int(value).bit_length() > JAMOVI_MAX_BITS:
                    return True
        return False
    
    def set_storage_type_from_dtype(self, dtype: pl.DataType):
        """Map a Polars dtype to the corresponding jamovi storage DataType."""
        if dtype.is_integer():
            return DataType.INTEGER
        if dtype.is_float() or dtype.is_decimal():
            return DataType.DECIMAL
        
        return DataType.TEXT
    
    def promote_storage(self, incoming: pl.DataType):
        """Promote the column storage type when a wider incoming dtype is seen."""
        incoming_storage_type = self.set_storage_type_from_dtype(incoming)

        if self.data_type is None:
            self.set_data_type(incoming_storage_type)
            return

        if STORAGE_ORDER[self.data_type] < STORAGE_ORDER[incoming_storage_type]:
            self.set_data_type(incoming_storage_type)

    def should_profile_kind(self) -> bool:
        """Return whether semantic kind profiling should continue for this column."""
        return self.state.final_kind in PROFILE_KINDS
    
    def is_missing_level_value(self, value: Any) -> bool:
        """Delegate missing-level checks to the pipeline state object."""
        return self.state.is_missing_level_value(value)
    
    def are_all_values_integer_like(self) -> bool:
        """Return whether only integer-like numeric values were observed."""
        return self.state.are_all_values_integer_like()
    
    def check_chunk_for_non_integer_floats(self, chunk_df: pl.DataFrame) -> None:
        """Update integer-like tracking for this column using a chunk."""
        self.state.check_chunk_for_non_integer_floats(chunk_df, self.name)


# 1. Define the structure of a single range entry
class MissingRangeEntry(TypedDict):
    lo: Union[float, str]
    hi: Union[float, str]

# 2. Define the alias for the full mapping
# Keys are column names (strings), values are lists of range entries
MissingRangesMapping = Dict[str, List[MissingRangeEntry]]

class PyreadstatMeta(Protocol):
    column_names: list[str]
    column_labels: list[str] | None

    readstat_variable_types: dict[str, str] | None
    original_variable_types: dict[str, str] | None

    variable_measures: dict[str, str]
    variable_value_labels: dict[str, dict[Any, str]]

    missing_ranges: MissingRangesMapping
