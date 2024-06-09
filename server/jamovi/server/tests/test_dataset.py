
from pytest import fixture

from tempfile import TemporaryDirectory
from os import path

from jamovi.core import DataSet
from jamovi.core import MemoryMap
from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType


@fixture
def temp_dir() -> str:
    with TemporaryDirectory() as temp:
        yield temp


@fixture
def memory_map(temp_dir: str) -> MemoryMap:
    temp_file = path.join(temp_dir, 'fred.mm')
    mm = MemoryMap.create(temp_file)
    yield mm
    mm.close()


@fixture
def empty_dataset(memory_map: MemoryMap) -> DataSet:
    return DataSet.create(memory_map)


def test_columns_persist_properties(empty_dataset):

    # GIVEN a column
    # WHEN i change its property values
    # THEN the property values are persisted

    dataset = empty_dataset
    column = dataset.append_column('fred')

    column.auto_measure = True
    assert column.auto_measure is True
    column.auto_measure = False
    assert column.auto_measure is False

    column.column_type = ColumnType.DATA
    assert column.column_type is ColumnType.DATA

    column.column_type = ColumnType.COMPUTED
    assert column.column_type is ColumnType.COMPUTED

    column.description = 'the fish was delish äüïöëÿ'
    assert column.description == 'the fish was delish äüïöëÿ'

    column.formula = '6 + 2 - 3'
    assert column.formula == '6 + 2 - 3'

    column.formula_message = 'your formula is bad'
    assert column.formula_message == 'your formula is bad'

    column.id = 7
    assert column.id == 7

    column.import_name = 'bruce äüïöëÿ'
    assert column.import_name == 'bruce äüïöëÿ'

    column.measure_type = MeasureType.CONTINUOUS
    assert column.measure_type is MeasureType.CONTINUOUS

    column.name = 'fred äüïöëÿ'
    assert column.name == 'fred äüïöëÿ'
