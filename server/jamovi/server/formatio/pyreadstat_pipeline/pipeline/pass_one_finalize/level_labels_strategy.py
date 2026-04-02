from dataclasses import dataclass
from enum import Enum, auto
from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import ImportColumn
from jamovi.server.dataset import DataType
from jamovi.core import MeasureType


class LevelLabelStrategy(Enum):
    """Strategy for calculating level labels based on column type."""
    
    # TEXT columns
    TEXT_NOMINAL = auto()
    TEXT_ORDINAL = auto()
    TEXT_CONTINUOUS = auto()
    TEXT_ID = auto()
    
    # INTEGER columns
    INTEGER_NOMINAL = auto()
    INTEGER_ORDINAL = auto()
    INTEGER_CONTINUOUS = auto()
    INTEGER_ID = auto()
    
    # DECIMAL columns
    DECIMAL_NOMINAL = auto()
    DECIMAL_ORDINAL = auto()
    DECIMAL_CONTINUOUS = auto()
    DECIMAL_ID = auto()
    
    # Unknown/unhandled
    UNKNOWN = auto()


@dataclass
class LevelLabelPlan:
    """Output plan for how to handle levels and values."""
    
    # Whether to create levels/value labels in the column
    needs_levels: bool
    
    # How to encode the levels/labels
    level_encoding: str  # 'integer', 'decimal', 'text', 'none'
    
    # Whether to preserve order
    preserve_order: bool
    
    # Special handling notes
    notes: str | None = None


STRATEGY_BY_TYPE: dict[tuple[DataType, MeasureType], LevelLabelStrategy] = {
    (DataType.TEXT, MeasureType.NOMINAL): LevelLabelStrategy.TEXT_NOMINAL,
    (DataType.TEXT, MeasureType.ORDINAL): LevelLabelStrategy.TEXT_ORDINAL,
    (DataType.TEXT, MeasureType.CONTINUOUS): LevelLabelStrategy.TEXT_CONTINUOUS,
    (DataType.TEXT, MeasureType.ID): LevelLabelStrategy.TEXT_ID,
    (DataType.INTEGER, MeasureType.NOMINAL): LevelLabelStrategy.INTEGER_NOMINAL,
    (DataType.INTEGER, MeasureType.ORDINAL): LevelLabelStrategy.INTEGER_ORDINAL,
    (DataType.INTEGER, MeasureType.CONTINUOUS): LevelLabelStrategy.INTEGER_CONTINUOUS,
    (DataType.INTEGER, MeasureType.ID): LevelLabelStrategy.INTEGER_ID,
    (DataType.DECIMAL, MeasureType.NOMINAL): LevelLabelStrategy.DECIMAL_NOMINAL,
    (DataType.DECIMAL, MeasureType.ORDINAL): LevelLabelStrategy.DECIMAL_ORDINAL,
    (DataType.DECIMAL, MeasureType.CONTINUOUS): LevelLabelStrategy.DECIMAL_CONTINUOUS,
    (DataType.DECIMAL, MeasureType.ID): LevelLabelStrategy.DECIMAL_ID,
}


BASE_PLAN_BY_STRATEGY: dict[LevelLabelStrategy, LevelLabelPlan] = {
    LevelLabelStrategy.TEXT_NOMINAL: LevelLabelPlan(
        needs_levels=True,
        level_encoding='text',
        preserve_order=False,
        notes="Text values become level labels. Max 50 unique values or convert to ID.",
    ),
    LevelLabelStrategy.TEXT_ORDINAL: LevelLabelPlan(
        needs_levels=True,
        level_encoding='text',
        preserve_order=True,
        notes="Text values become ordered level labels.",
    ),
    LevelLabelStrategy.TEXT_CONTINUOUS: LevelLabelPlan(
        needs_levels=False,
        level_encoding='none',
        preserve_order=False,
    ),
    LevelLabelStrategy.TEXT_ID: LevelLabelPlan(
        needs_levels=False,
        level_encoding='none',
        preserve_order=False,
        notes="Text ID column: values are unique identifiers.",
    ),
    LevelLabelStrategy.INTEGER_NOMINAL: LevelLabelPlan(
        needs_levels=True,
        level_encoding='integer',
        preserve_order=False,
        notes="Integer values become level indices. Validate bit_length <= 32.",
    ),
    LevelLabelStrategy.INTEGER_ORDINAL: LevelLabelPlan(
        needs_levels=True,
        level_encoding='integer',
        preserve_order=True,
        notes="Integer values become ordered level indices.",
    ),
    LevelLabelStrategy.INTEGER_CONTINUOUS: LevelLabelPlan(
        needs_levels=False,
        level_encoding='none',
        preserve_order=False,
    ),
    LevelLabelStrategy.INTEGER_ID: LevelLabelPlan(
        needs_levels=False,
        level_encoding='none',
        preserve_order=False,
    ),
    LevelLabelStrategy.DECIMAL_NOMINAL: LevelLabelPlan(
        needs_levels=True,
        level_encoding='decimal',
        preserve_order=False,
        notes="Decimal values become level indices. Check DPS for integer conversion.",
    ),
    LevelLabelStrategy.DECIMAL_ORDINAL: LevelLabelPlan(
        needs_levels=True,
        level_encoding='decimal',
        preserve_order=True,
        notes="Decimal values become ordered level indices.",
    ),
    LevelLabelStrategy.DECIMAL_CONTINUOUS: LevelLabelPlan(
        needs_levels=False,
        level_encoding='none',
        preserve_order=False,
    ),
    LevelLabelStrategy.DECIMAL_ID: LevelLabelPlan(
        needs_levels=False,
        level_encoding='none',
        preserve_order=False,
    ),
    LevelLabelStrategy.UNKNOWN: LevelLabelPlan(
        needs_levels=False,
        level_encoding='none',
        preserve_order=False,
    ),
}


def get_level_label_strategy(column: ImportColumn) -> LevelLabelStrategy:
    """
    Determine the level labels strategy based on data_type and measure_type.
    
    Args:
        column: ImportColumn with data_type and measure_type set
        
    Returns:
        LevelLabelStrategy enum indicating how to handle level labels
    """
    return STRATEGY_BY_TYPE.get(
        (column.data_type, column.measure_type),
        LevelLabelStrategy.UNKNOWN,
    )


def get_level_label_plan(_column: ImportColumn, strategy: LevelLabelStrategy) -> LevelLabelPlan:
    """
    Get the detailed plan for how to handle levels, values, and encoding.
    
    Args:
        column: ImportColumn to analyze
        strategy: LevelLabelStrategy to apply
        
    Returns:
        LevelLabelPlan with detailed handling instructions
    """
    base = BASE_PLAN_BY_STRATEGY.get(strategy, BASE_PLAN_BY_STRATEGY[LevelLabelStrategy.UNKNOWN])
    return LevelLabelPlan(
        needs_levels=base.needs_levels,
        level_encoding=base.level_encoding,
        preserve_order=base.preserve_order,
        notes=base.notes,
    )