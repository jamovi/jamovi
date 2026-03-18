from dataclasses import dataclass, field
from numbers import Number
from typing import Any, Protocol, TypedDict, Dict, List, Union
from enum import Enum, auto
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType
import polars as pl

class SourceStorageType(Enum):
    UNKNOWN = auto()
    NUMERIC = auto()
    STRING = auto()


class SourceFormatType(Enum):
    UNKNOWN = auto()

    NUMERIC = auto()
    STRING = auto()

    DATE = auto()
    TIME = auto()
    DATETIME = auto()

    CURRENCY = auto()
    PERCENT = auto()
    SCIENTIFIC = auto()


class SourceMeasureType(Enum):
    UNKNOWN = auto()
    NOMINAL = auto()
    ORDINAL = auto()
    SCALE = auto()


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

@dataclass
class ImportColumnMeta:
    name: str
    source_label: str | None
    source_storage_type: str | None
    source_format_code: str | None
    source_measure_level: str | None
    source_value_labels: str | None

    semantic_type: str | None
    polars_dtype: Any | None

@dataclass
class SourceColumnInfo:
    name: str

    storage_type: SourceStorageType
    format_type: SourceFormatType
    measure_type: SourceMeasureType

    polars_dtype: Any | None = None

    column_width: Number | None = 0

    has_value_labels: bool = False
    value_labels: dict[Any, str] = field(default_factory=dict)

    variable_label: str | None = None
    source_format_code: str | None = None

    missing_ranges: list[str] | None = None

@dataclass
class ColumnIngestPlan: 
    name: str 
    cast_to: pl.DataType | None = None
    fill_nulls: Any| None = None
    preserve_temporal_numeric: bool = False

@dataclass
class ColumnProfileState:
    name: str
    kind: SemanticColumnKind

    is_frozen: bool = False
    values_seen: int = 0
    distinct_values: set[Any] = field(default_factory=set)

    exceeded_categorical_threshold: bool = False
    freeze_reason: str | None = None

@dataclass
class JamoviColumnPlan: 
    name: str 
    data_type: DataType   
    measure_type: MeasureType
    column_width: Number | None = 0
    levels: list[tuple[Any, str]] = field(default_factory=list)   
    variable_label: str | None = None
    missing_values: Any = None

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
