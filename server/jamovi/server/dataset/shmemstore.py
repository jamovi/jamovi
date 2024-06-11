
from typing import TYPE_CHECKING

from .core import MemoryMap as CoreMemoryMap
from .core import DataSet as CoreDataSet
from .store import Store
from .shmemdataset import SharedMemoryDataSet


# python 3.8 compatibility (for now)
if TYPE_CHECKING:
    from typing import Self
else:
    Self = object


class SharedMemoryStore(Store):

    _mm: CoreMemoryMap

    @staticmethod
    def create(path: str) -> Self:
        cmm = CoreMemoryMap.create(path)
        return SharedMemoryStore(cmm)

    def __init__(self, mm: CoreMemoryMap):
        self._mm = mm

    def create_dataset(self) -> SharedMemoryDataSet:
        # we're not actually returning a SharedMemoryDataSet here
        return CoreDataSet.create(self._mm)

    def retrieve_dataset(self) -> SharedMemoryDataSet:
        # we're not actually returning a SharedMemoryDataSet here
        return CoreDataSet.retrieve(self._mm)

    def close(self) -> None:
        self._mm.close()
