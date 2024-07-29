
import pytest  # noqa: F401

from jamovi.server.dataset.duckdataset import DuckDataSet
from jamovi.server.dataset.datacache import DataWriteBuffer


@pytest.fixture
def empty_write_buffer(empty_dataset: DuckDataSet):
    return DataWriteBuffer(empty_dataset.set_values)


def test_old_dataset_basics(empty_dataset: DuckDataSet):
    dataset = empty_dataset
    assert dataset.row_count == 0
    assert dataset.column_count == 0

    dataset.set_row_count(5)
    assert dataset.row_count == 5
    assert dataset.column_count == 0

    dataset.append_column("col_1")
    assert dataset.column_count == 1

    dataset.set_value(0, 0, 1)
    dataset.commit_set_values()
    assert dataset.get_value(0, 0) == 1


def test_add_value(empty_write_buffer):
    buffer = empty_write_buffer
    buffer.stage((0, 0), 1)
    assert buffer._write_buffer == {(0, 0): 1}
    assert len(buffer._write_buffer) == 1


def test_add_value_commit_max_items(empty_dataset: DuckDataSet):
    dataset = empty_dataset
    col = dataset.append_column("col_1")
    col_iid = col.iid

    buffer = dataset._write_buffer

    buffer._max_items = 2
    buffer.stage((0, col_iid), 1)
    buffer.stage((1, col_iid), 2)
    buffer.stage((2, col_iid), 3)
    assert buffer._write_buffer == {(2, col_iid): 3}
    assert len(buffer._write_buffer) == 1

    buffer.commit()
    assert buffer._write_buffer == {}
    assert len(buffer._write_buffer) == 0


