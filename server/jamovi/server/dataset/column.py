
from typing import Protocol
from abc import abstractmethod

from .core import DataType
from .core import ColumnType
from .core import MeasureType


class Column(Protocol):

    @property
    @abstractmethod
    def id(self) -> int:
        raise NotImplementedError

    @id.setter
    @abstractmethod
    def id(self, value: int) -> None:
        raise NotImplementedError

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @name.setter
    @abstractmethod
    def name(self, value: str) -> None:
        raise NotImplementedError

    @property
    @abstractmethod
    def import_name(self) -> str:
        raise NotImplementedError

    @import_name.setter
    @abstractmethod
    def import_name(self, value: str) -> None:
        raise NotImplementedError

    @property
    @abstractmethod
    def description(self) -> str:
        raise NotImplementedError

    @description.setter
    @abstractmethod
    def description(self, value: str) -> None:
        raise NotImplementedError

    @property
    @abstractmethod
    def data_type(self) -> DataType:
        raise NotImplementedError

    @property
    @abstractmethod
    def column_type(self) -> ColumnType:
        raise NotImplementedError

    @column_type.setter
    @abstractmethod
    def column_type(self, value: ColumnType) -> None:
        raise NotImplementedError

    @property
    @abstractmethod
    def measure_type(self) -> MeasureType:
        raise NotImplementedError

    @measure_type.setter
    @abstractmethod
    def measure_type(self, value: MeasureType):
        raise NotImplementedError

    @property
    @abstractmethod
    def auto_measure(self) -> bool:
        raise NotImplementedError

    @auto_measure.setter
    @abstractmethod
    def auto_measure(self, value: bool):
        raise NotImplementedError

    @property
    @abstractmethod
    def formula(self) -> str:
        raise NotImplementedError

    @formula.setter
    @abstractmethod
    def formula(self, value: str):
        raise NotImplementedError

    @property
    @abstractmethod
    def formula_message(self) -> str:
        raise NotImplementedError

    @formula_message.setter
    @abstractmethod
    def formula_message(self, value: str):
        raise NotImplementedError

    @property
    @abstractmethod
    def dps(self) -> int:
        raise NotImplementedError

    @dps.setter
    @abstractmethod
    def dps(self, value: int):
        raise NotImplementedError

    @property
    @abstractmethod
    def trim_levels(self) -> bool:
        raise NotImplementedError

    @trim_levels.setter
    @abstractmethod
    def trim_levels(self, value: bool):
        raise NotImplementedError

    @abstractmethod
    def determine_dps(self):
        raise NotImplementedError

    @property
    @abstractmethod
    def active(self) -> bool:
        raise NotImplementedError

    @active.setter
    @abstractmethod
    def active(self, value: bool):
        raise NotImplementedError

    @abstractmethod
    def append(self, value):
        raise NotImplementedError

    @abstractmethod
    def append_level(self, raw, label, import_value=None, pinned=False) -> None:
        raise NotImplementedError

    @abstractmethod
    def insert_level(self, raw, label, import_value=None, pinned=False) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_label(self, value) -> str:
        raise NotImplementedError

    @abstractmethod
    def get_value_for_label(self, label):
        raise NotImplementedError

    @abstractmethod
    def clear_levels(self):
        raise NotImplementedError

    @abstractmethod
    def trim_unused_levels(self):
        raise NotImplementedError

    @property
    @abstractmethod
    def has_levels(self):
        raise NotImplementedError

    @property
    @abstractmethod
    def level_count(self):
        raise NotImplementedError

    @abstractmethod
    def has_level(self, index_or_name):
        raise NotImplementedError

    @property
    @abstractmethod
    def levels(self):
        raise NotImplementedError

    @property
    @abstractmethod
    def missing_values(self):
        raise NotImplementedError

    @property
    @abstractmethod
    def row_count(self):
        raise NotImplementedError

    @property
    @abstractmethod
    def row_count_ex_filtered(self):
        raise NotImplementedError

    @property
    @abstractmethod
    def changes(self):
        raise NotImplementedError

    @abstractmethod
    def clear_at(self, index):
        raise NotImplementedError

    @abstractmethod
    def clear(self):
        raise NotImplementedError

    @abstractmethod
    def set_value(self, index, value, initing=False):
        raise NotImplementedError

    @abstractmethod
    def get_value(self, index):
        raise NotImplementedError

    @abstractmethod
    def __getitem__(self, index):
        return self.get_value(index)

    @abstractmethod
    def __iter__(self):
        raise NotImplementedError

    @abstractmethod
    def raw(self, index):
        raise NotImplementedError

    @abstractmethod
    def set_data_type(self, data_type):
        raise NotImplementedError

    @abstractmethod
    def set_measure_type(self, measure_type):
        raise NotImplementedError

    @abstractmethod
    def set_levels(self, levels):
        raise NotImplementedError

    @abstractmethod
    def set_missing_values(self, missing_values):
        raise NotImplementedError

    @abstractmethod
    def change(self, *, data_type=None, measure_type=None, levels=None):
        raise NotImplementedError

    @abstractmethod
    def should_treat_as_missing(self, index) -> bool:
        raise NotImplementedError
