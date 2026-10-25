import logging
from typing import Iterator

import pytest

from jamovi.server.dataset import Store
from jamovi.server.dataset import ColumnType
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType
from jamovi.server.datasetmodel import DataSetModel


@pytest.fixture
def model(shared_memory_store: Store) -> Iterator[DataSetModel]:
    model = DataSetModel()
    model.set_log(logging.getLogger(__name__))
    model.dataset = shared_memory_store.create_dataset()
    model.dataset.attach()
    model.set_row_count(3)
    column = model.append_column('I')
    column.column_type = ColumnType.DATA
    column.change(data_type=DataType.INTEGER, measure_type=MeasureType.CONTINUOUS)
    column.set_values(0, [1, 2, 40])
    yield model
    model.dataset.detach()


@pytest.mark.parametrize('formula', ['I * 100000000', 'FLOOR(10.5 ^ I)', 'INT(10 ^ I)'])
def test_integer_results_too_large_are_missing(model, formula):
    """an integer result outside the 32-bit range makes the row missing (rather
    than stopping the recalc)"""
    column = model.append_column('computed')
    column.column_type = ColumnType.COMPUTED
    column.formula = formula
    column.parse_formula()
    column.set_needs_recalc()
    column.recalc()
    assert column.data_type is DataType.INTEGER
    values = [column.get_value(i) for i in range(3)]
    assert values[2] == -2147483648
    assert values[0] != -2147483648
