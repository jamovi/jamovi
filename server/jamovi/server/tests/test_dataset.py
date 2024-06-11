
from tempfile import TemporaryDirectory
from os import path

from pytest import fixture

from jamovi.server.dataset import StoreFactory
from jamovi.server.dataset import Store
from jamovi.server.dataset import DataSet
from jamovi.server.dataset import Column
from jamovi.server.dataset import ColumnType
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType


@fixture
def temp_dir() -> str:
    with TemporaryDirectory() as temp:
        yield temp


@fixture
def shared_memory_store(temp_dir: str) -> Store:
    temp_file = path.join(temp_dir, 'fred.mm')
    store = StoreFactory.create(temp_file, 'shmem')
    yield store
    store.close()


@fixture
def duckdb_store(temp_dir: str) -> Store:
    temp_file = path.join(temp_dir, 'fred.duckdb')
    store = StoreFactory.create(temp_file, 'duckdb')
    yield store
    store.close()


@fixture
def empty_dataset(shared_memory_store: Store) -> DataSet:
    return shared_memory_store.create_dataset()


@fixture
def empty_column(empty_dataset: DataSet) -> Column:
    return empty_dataset.append_column('fred')


def test_columns_persist_properties(empty_column: Column):

    # GIVEN a column
    # WHEN i change its property values
    # THEN the property values are persisted

    column = empty_column

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
