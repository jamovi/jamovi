
from pytest import fixture

from tempfile import TemporaryDirectory
from os import path

from jamovi.core import DataSet
from jamovi.core import MemoryMap
from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType


@fixture
def temp_dir():
    with TemporaryDirectory() as temp:
        yield temp


@fixture
def memory_map(temp_dir: str):
    temp_file = path.join(temp_dir, 'fred.mm')
    mm = MemoryMap.create(temp_file)
    yield mm
    mm.close()


@fixture
def dataset(memory_map):
    return DataSet.create(memory_map)


def test_dataset(dataset):

    c1 = dataset.append_column('fred')
    c2 = dataset.append_column('jim')
    c3 = dataset.append_column('bob')

    dataset.set_row_count(30)

    assert dataset.column_count == 3
    assert dataset.row_count == 30

    c1.column_type = ColumnType.FILTER
    c2.column_type = ColumnType.DATA
    c3.column_type = ColumnType.COMPUTED

    assert c1.column_type is ColumnType.FILTER
    assert c2.column_type is ColumnType.DATA
    assert c3.column_type is ColumnType.COMPUTED
