
from typing import Protocol
from abc import abstractmethod

from .dataset import DataSet

class Store(Protocol):

    @abstractmethod
    def create_dataset(self) -> DataSet:
        raise NotImplementedError

    @abstractmethod
    def retrieve_dataset(self) -> DataSet:
        raise NotImplementedError

    @abstractmethod
    def close(self) -> None:
        raise NotImplementedError
