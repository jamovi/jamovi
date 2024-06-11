
from typing import Protocol
from typing import Iterator
from typing import Iterable
from typing import Union  # python 3.8 compatibility (for now)
from abc import abstractmethod

from .column import Column

class DataSet(Protocol):

    @abstractmethod
    def __getitem__(self, index_or_name: Union[str, int]) -> Column:
        raise NotImplementedError

    @abstractmethod
    def __iter__(self) -> Iterator[Column]:
        raise NotImplementedError

    @abstractmethod
    def append_column(self, name: str, import_name: str='') -> Column:
        raise NotImplementedError

    @abstractmethod
    def insert_column(self, index: int, name: str, import_name: str='') -> Column:
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
    def set_weights(self, weights_id: int):
        raise NotImplementedError

    @abstractmethod
    def get_index_ex_filtered(self, index: int) -> int:
        raise NotImplementedError

    @abstractmethod
    def get_indices_ex_filtered(self, row_start: int, row_count: int) -> Iterable[int]:
        raise NotImplementedError

    @abstractmethod
    def refresh_filter_state(self) -> None:
        raise NotImplementedError
