from dataclasses import field
from numbers import Number
from typing import Any, Protocol, TypedDict, Dict, List, Union
from enum import Enum, auto
import polars as pl
from jamovi.server.dataset import Column
from jamovi.server.dataset import DataType
from jamovi.core import MeasureType


JAMOVI_MAX_BITS = 32

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



class ImportInfo(Protocol):
    #source data
    source_format: SourceFormatType = None
    final_kind: SemanticColumnKind = None

    # profile states
    is_frozen: bool = False
    exceeded_categorical_threshold: bool = False
    freeze_reason: str | None = None
    
    #levels
    level_chunks: pl.DataFrame = pl.DataFrame()
    value_levels: list[str] | None = None

    def is_numeric(self):
        return self.data_type == DataType.DECIMAL or self.data_type == DataType.INTEGER

    def is_categorical(self):
        return self.measure_type == MeasureType.NOMINAL or self.measure_type == MeasureType.ORDINAL
    
    def is_any_label_bits_too_wide(self):
        if self.value_labels is not None:
            for value in self.value_labels:
                if isinstance(value, Number) and int(value).bit_length() > JAMOVI_MAX_BITS:
                    return True
        return False
    
    def promote_storage(self, incoming: DataType):
        order = {
            DataType.INTEGER: 0,
            DataType.DECIMAL: 1,
            DataType.TEXT: 2
        }

        if self.data_type is None:
            return incoming
        
        if order[self.data_type] < order[incoming]:
            self.data_type = incoming

    def should_profile_kind(self) -> bool:
        return self.final_kind in {
            SemanticColumnKind.TEXT_CANDIDATE,
            SemanticColumnKind.NOMINAL_CANDIDATE,
        }
    
    def final_polars_dtype(self):
        match self.data_type:
            case DataType.INTEGER:
                return pl.Int32
            case DataType.DECIMAL:
                return pl.Float64
            case _:
                return pl.Uint8
            
    def preserve_temporal_numeric(self):
        return self.source_format in {
            SourceFormatType.DATE,
            SourceFormatType.TIME,
            SourceFormatType.DATETIME
            }
    
    def fill_nulls(self):
        if self.preserve_temporal_numeric():
            return -2147483648
        else:
            return False 
        


ImportColumn = ImportInfo | Column


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
