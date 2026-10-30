from typing import Protocol
from typing import Iterator
from typing import Iterable
from typing import Union  # python 3.8 compatibility (for now)
from abc import abstractmethod

from .column import Column
from .column import CellValue


ColumnRef = int | str | Iterable[int] | Iterable[str]
CellValueArea = Iterable[Iterable[CellValue]]


class DataSet(Protocol):
    @abstractmethod
    def __getitem__(self, index_or_name: Union[str, int]) -> Column:
        raise NotImplementedError

    @abstractmethod
    def __iter__(self) -> Iterator[Column]:
        raise NotImplementedError

    @abstractmethod
    def set_values(self, columns: ColumnRef, row_offset: int, values: CellValueArea):
        raise NotImplementedError

    @abstractmethod
    def get_values(self, columns: ColumnRef, row_offset: int, n_rows: int) -> CellValueArea:
        raise NotImplementedError

    @abstractmethod
    def append_column(self, name: str, import_name: str = "") -> Column:
        raise NotImplementedError

    @abstractmethod
    def insert_column(self, index: int, name: str, import_name: str = "") -> Column:
        raise NotImplementedError

    @abstractmethod
    def set_row_count(self, count: int) -> None:
        raise NotImplementedError

    @abstractmethod
    def insert_rows(self, row_start: int, row_end: int) -> None:
        raise NotImplementedError

    @abstractmethod
    def delete_rows(self, row_start: int, row_end: int) -> None:
        raise NotImplementedError

    @abstractmethod
    def delete_columns(self, col_start: int, col_end: int) -> None:
        raise NotImplementedError

    @abstractmethod
    def is_row_filtered(self, index: int) -> bool:
        raise NotImplementedError

    @property
    @abstractmethod
    def row_count(self) -> int:
        raise NotImplementedError

    @property
    @abstractmethod
    def row_count_ex_filtered(self) -> int:
        raise NotImplementedError

    @property
    @abstractmethod
    def column_count(self) -> int:
        raise NotImplementedError

    @property
    @abstractmethod
    def weights(self) -> int:
        raise NotImplementedError

    @abstractmethod
    def set_weights(self, weights_id: int) -> None:
        raise NotImplementedError

    @abstractmethod
    def refresh_filter_state(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def refresh_view_order(self, sort_keys: list[tuple[int, bool]], ex_filtered: bool) -> bool:
        """rebuild the view order: the data set rows displayed, in the order
        they're displayed. sort_keys are (column id, descending) pairs, and
        ex_filtered omits filtered rows. returns whether it changed"""
        raise NotImplementedError

    @property
    @abstractmethod
    def view_row_count(self) -> int:
        """the number of data set rows displayed"""
        raise NotImplementedError

    @abstractmethod
    def get_data_indices(self, view_start: int, view_count: int) -> list[int]:
        """the data set rows displayed at a range of view rows (only those
        less than view_row_count)"""
        raise NotImplementedError

    @abstractmethod
    def get_view_indices(self, data_indices: Iterable[int]) -> list[int]:
        """the view rows displaying data set rows (omitting those not displayed)"""
        raise NotImplementedError

    @abstractmethod
    def attach(self, read_only: bool = False) -> None:
        """attach to the backing store"""
        raise NotImplementedError

    @abstractmethod
    def detach(self) -> None:
        """detach from the backing store"""
        raise NotImplementedError
