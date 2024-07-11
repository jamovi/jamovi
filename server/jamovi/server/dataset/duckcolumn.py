
from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Iterable
from typing import TypeAlias
from collections.abc import Sequence

from .core import DataType
from .core import ColumnType
from .core import MeasureType

from .column import Column

if TYPE_CHECKING:
    from .duckdataset import DuckDataSet


Level: TypeAlias = tuple[int, str, str, bool]


class DuckColumn(Column):

    _dataset: 'DuckDataSet'
    _levels: tuple[Level]

    _iid: int
    _index: int
    _column_id: int
    _name: str
    _import_name: str
    _description: str
    _column_type: int
    _data_type: int
    _measure_type: int
    _auto_measure: bool
    _formula: str
    _formula_message: str
    _dps: int
    _trim_levels: bool

    def __init__(self, dataset: 'DuckDataSet'):
        self._dataset = dataset
        self._levels = tuple()

    @property
    def iid(self) -> int:
        return self._iid

    @property
    def index(self) -> int:
        return self._index

    @index.setter
    def index(self, index: int) -> None:
        self._apply('index', index)

    @property
    def id(self) -> int:
        return self._column_id

    @id.setter
    def id(self, value: int) -> None:
        self._apply('column_id', value)

    def _apply(self, name: str, value) -> None:
        self._dataset.column_set_attribute(self, name, value)

    def notify_attribute_changed(self, name: str, value) -> None:
        setattr(self, f'_{ name }', value)

    def notify_levels_changed(self, levels: tuple[Level]):
        self._levels = levels

    def setup(self, *values) -> None:
        for name, value in zip(self.sql_fields(), values):
            setattr(self, f'_{name}', value)

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str) -> None:
        self._apply('name', value)

    @property
    def import_name(self) -> str:
        return self._import_name

    @import_name.setter
    def import_name(self, value: str) -> None:
        self._apply('import_name', value)

    @property
    def description(self) -> str:
        return self._description

    @description.setter
    def description(self, value: str) -> None:
        self._apply('description', value)

    @property
    def data_type(self) -> DataType:
        return DataType(self._data_type)

    @property
    def column_type(self) -> ColumnType:
        return ColumnType(self._column_type)

    @column_type.setter
    def column_type(self, value: ColumnType) -> None:
        self._apply('column_type', value.value)

    @property
    def measure_type(self) -> MeasureType:
        return MeasureType(self._measure_type)

    @measure_type.setter
    def measure_type(self, value: MeasureType):
        self._apply('measure_type', value.value)

    @property
    def auto_measure(self) -> bool:
        return self._auto_measure

    @auto_measure.setter
    def auto_measure(self, value: bool):
        self._apply('auto_measure', value)

    @property
    def formula(self) -> str:
        return self._formula

    @formula.setter
    def formula(self, value: str):
        self._apply('formula', value)

    @property
    def formula_message(self) -> str:
        return self._formula_message

    @formula_message.setter
    def formula_message(self, value: str):
        self._apply('formula_message', value)

    @property
    def dps(self) -> int:
        return self._dps

    @dps.setter
    def dps(self, value: int):
        self._apply('dps', value)

    def set_data_type(self, data_type: DataType):
        self._apply('data_type', data_type.value)

    def set_measure_type(self, measure_type: MeasureType):
        self._apply('measure_type', measure_type.value)

    def change(self, *, data_type=None, measure_type=None, levels=None):
        self._dataset.column_change(self, data_type=data_type, measure_type=measure_type)
        # if data_type is not None:
        #     self.set_data_type(data_type)
        # if measure_type is not None:
        #     self.set_measure_type(measure_type)

    def set_value(self, index, value, initing=False):
        self._dataset.set_value(index, self.index, value, initing)

    def get_value(self, index: int):
        return self._dataset.get_value(index, self)

    @property
    def trim_levels(self) -> bool:
        return self._trim_levels

    @trim_levels.setter
    def trim_levels(self, value: bool):
        self._apply('trim_levels', value)

    def determine_dps(self):
        # TODO
        pass

    @property
    def active(self) -> bool:
        # TODO
        return True

    @active.setter
    def active(self, value: bool):
        # TODO
        pass

    def append(self, value):
        raise NotImplementedError

    def append_level(self, raw, label, import_value=None, pinned=False) -> None:
        self._dataset.column_append_level(self, raw, label, import_value, pinned)

    def insert_level(self, raw, label, import_value=None, pinned=False) -> None:
        raise NotImplementedError

    def get_label(self, value: int) -> str:
        raise NotImplementedError

    def get_value_for_label(self, label: str):
        for value, level_label, import_label, _ in self._levels:
            if level_label == label or import_label == label:
                return value
        raise KeyError

    def clear_levels(self):
        raise NotImplementedError

    def trim_unused_levels(self):
        raise NotImplementedError

    @property
    def has_levels(self):
        return self.measure_type is not MeasureType.ID and self.measure_type is not MeasureType.CONTINUOUS

    @property
    def level_count(self):
        return len(self._levels)

    def has_level(self, index_or_name):
        if isinstance(index_or_name, int):
            index = index_or_name
            for level in self.levels:
                if level[0] == index:
                    return True
        else:
            name = index_or_name
            for level in self.levels:
                if level[1] == name or level[2] == name:
                    return True
        return False

    @property
    def levels(self) -> Sequence[tuple[int, str, str, bool]]:
        return self._levels

    @property
    def missing_values(self):
        # TODO
        return []

    @property
    def row_count(self):
        return self._dataset.row_count

    @property
    def row_count_ex_filtered(self):
        return self._dataset.row_count_ex_filtered

    @property
    def changes(self):
        # TODO
        return [ ]

    def clear_at(self, index):
        # TODO
        pass

    def clear(self):
        # TODO
        pass

    def __getitem__(self, index):
        return self.get_value(index)

    def __iter__(self):
        raise NotImplementedError

    def raw(self, index):
        raise NotImplementedError

    def set_levels(self, levels):
        # TODO
        pass

    def set_missing_values(self, missing_values):
        # TODO
        pass

    def should_treat_as_missing(self, index) -> bool:
        # TODO
        return False

    def __repr__(self):
        pieces = [ ]
        for field in DuckColumn.sql_fields():
            pieces.append(f'{ field }={ repr(getattr(self, "_" + field)) }')
        return f'DuckColumn({ ", ".join(pieces) })'

    @staticmethod
    def sql_fields() -> Iterable[str]:
        return (
            'iid',
            'index',
            'column_id',
            'name',
            'import_name',
            'description',
            'column_type',
            'data_type',
            'measure_type',
            'auto_measure',
            'formula',
            'formula_message',
            'dps',
            'trim_levels',
        )

