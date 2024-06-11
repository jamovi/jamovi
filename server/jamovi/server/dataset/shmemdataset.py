
from .core import DataSet as CoreDataSet
from .dataset import DataSet

class SharedMemoryDataSet(CoreDataSet, DataSet):  # pylint: disable=abstract-method
    ''' this is just a shim for pylint '''
