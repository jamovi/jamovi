"""Tests for edits made while the view order differs from the data order.

When filtered rows are hidden, view row n is not data row n; edits, undo
and redo must all land on the data rows the user actually edited.
"""

import pytest
import pytest_asyncio

from jamovi.server import jamovi_pb2 as jcoms
from jamovi.server.instance import Instance

from jamovi.tests.test_instance import FakeComs, _open


def _set_request() -> jcoms.DataSetRR:
    request = jcoms.DataSetRR()
    request.op = jcoms.GetSet.Value('SET')
    return request


async def _send(instance: Instance, coms: FakeComs, request: jcoms.DataSetRR) -> jcoms.DataSetRR:
    await instance.on_request(request)
    assert coms.errors == [ ]
    return coms.sent[-1]


async def _set_ints(instance: Instance, coms: FakeComs, row_start: int, column_start: int, values: list[int]):
    request = _set_request()
    request.incData = True
    block = request.data.add()
    block.rowStart = row_start
    block.columnStart = column_start
    block.rowCount = len(values)
    block.columnCount = 1
    for value in values:
        block.values.add().i = value
    return await _send(instance, coms, request)


async def _insert_filter(instance: Instance, coms: FakeComs, formula: str):
    # as the client does: insert a blank filter, then set its formula
    for action in ('INSERT', 'MODIFY'):
        request = _set_request()
        request.incSchema = True
        request.schema.filtersVisible = True
        column_pb = request.schema.columns.add()
        column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value(action)
        column_pb.index = 0
        column_pb.columnType = jcoms.ColumnType.Value('FILTER')
        column_pb.dataType = jcoms.DataSetSchema.ColumnSchema.DataType.Value('INTEGER')
        column_pb.measureType = jcoms.DataSetSchema.MeasureType.Value('NOMINAL')
        column_pb.active = True
        if action == 'MODIFY':
            column = instance.project.get_dataset()[0]
            column_pb.id = column.id
            column_pb.name = column.name
            column_pb.formula = formula
        await _send(instance, coms, request)


async def _set_filters_visible(instance: Instance, coms: FakeComs, visible: bool):
    request = _set_request()
    request.incSchema = True
    request.schema.filtersVisible = visible
    return await _send(instance, coms, request)


async def _op(instance: Instance, coms: FakeComs, op: str):
    request = jcoms.DataSetRR()
    request.op = jcoms.GetSet.Value(op)
    return await _send(instance, coms, request)


@pytest.fixture
def coms() -> FakeComs:
    return FakeComs()


@pytest_asyncio.fixture
async def filtered_instance(instance: Instance, coms: FakeComs) -> Instance:
    """A = 1..6, B = 10..60, with a filter 'A > 3' and filtered rows hidden.

    view rows 0, 1, 2 are data rows 3, 4, 5
    """
    await _open(instance)
    instance.set_coms(coms)

    await _set_ints(instance, coms, 0, 0, [ 1, 2, 3, 4, 5, 6 ])
    await _set_ints(instance, coms, 0, 1, [ 10, 20, 30, 40, 50, 60 ])
    await _insert_filter(instance, coms, 'A > 3')
    await _set_filters_visible(instance, coms, False)

    dataset = instance.project.get_dataset()
    assert dataset.row_count_ex_filtered == 3
    assert dataset.get_index_ex_filtered(0) == 3
    return instance


def _values(instance: Instance, name: str) -> list:
    dataset = instance.project.get_dataset()
    column = dataset.get_column_by_name(name)
    return [ column[i] for i in range(dataset.row_count) ]


@pytest.mark.asyncio
async def test_edit_with_filtered_rows_hidden(filtered_instance: Instance, coms: FakeComs):
    """an edit to a view row lands on the corresponding data row"""
    await _set_ints(filtered_instance, coms, 0, 1, [ 100 ])
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 100, 50, 60 ]


@pytest.mark.asyncio
async def test_undo_with_filtered_rows_hidden(filtered_instance: Instance, coms: FakeComs):
    """undoing an edit restores the value of the data row that was edited"""
    await _set_ints(filtered_instance, coms, 1, 1, [ 100, 200 ])
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 40, 100, 200 ]

    await _op(filtered_instance, coms, 'UNDO')
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 40, 50, 60 ]

    await _op(filtered_instance, coms, 'REDO')
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 40, 100, 200 ]


@pytest.mark.asyncio
async def test_undo_after_filtered_rows_shown(filtered_instance: Instance, coms: FakeComs):
    """an edit made with filtered rows hidden is undone correctly after they are shown"""
    await _set_ints(filtered_instance, coms, 0, 1, [ 100 ])
    await _set_filters_visible(filtered_instance, coms, True)

    await _op(filtered_instance, coms, 'UNDO')  # undoes showing the filtered rows
    await _op(filtered_instance, coms, 'UNDO')  # undoes the edit
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 40, 50, 60 ]


def _rects(response: jcoms.DataSetRR) -> list:
    return [ (block.rowStart, block.rowCount, block.columnStart, block.columnCount) for block in response.data ]


def _block_ints(block) -> list:
    return [ cell.i for cell in block.values ]


@pytest.mark.asyncio
async def test_undo_response_is_in_view_rows(filtered_instance: Instance, coms: FakeComs):
    """the cells reported back by an undo are view rows, with their restored values"""
    await _set_ints(filtered_instance, coms, 1, 1, [ 100, 200 ])
    response = await _op(filtered_instance, coms, 'UNDO')
    assert _rects(response) == [ (1, 2, 1, 1) ]
    assert _block_ints(response.data[0]) == [ 50, 60 ]


@pytest.mark.asyncio
async def test_redo_with_filtered_rows_shown(filtered_instance: Instance, coms: FakeComs):
    """an edit made with filtered rows hidden is redone onto the same data rows once they're shown"""
    await _set_ints(filtered_instance, coms, 0, 1, [ 100 ])
    await _set_filters_visible(filtered_instance, coms, True)
    await _op(filtered_instance, coms, 'UNDO')  # filters hidden
    await _op(filtered_instance, coms, 'UNDO')  # edit undone
    await _op(filtered_instance, coms, 'REDO')  # edit redone
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 100, 50, 60 ]


@pytest.mark.asyncio
async def test_paste_with_filtered_rows_hidden(filtered_instance: Instance, coms: FakeComs):
    """pasted text lands on the data rows displayed, and is undone from them"""
    request = _set_request()
    request.incData = True
    block = request.data.add()
    block.rowStart = 1
    block.columnStart = 1
    block.rowCount = 2
    block.columnCount = 1
    block.incCBData = True
    block.cbText = '100\n200\n'
    response = await _send(filtered_instance, coms, request)
    assert _rects(response) == [ (1, 2, 1, 1) ]
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 40, 100, 200 ]

    await _op(filtered_instance, coms, 'UNDO')
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 40, 50, 60 ]

    await _op(filtered_instance, coms, 'REDO')
    assert _values(filtered_instance, 'B') == [ 10, 20, 30, 40, 100, 200 ]


@pytest_asyncio.fixture
async def plain_instance(instance: Instance, coms: FakeComs) -> Instance:
    """A = 1..3, B = 10..30, no filters"""
    await _open(instance)
    instance.set_coms(coms)
    await _set_ints(instance, coms, 0, 0, [ 1, 2, 3 ])
    await _set_ints(instance, coms, 0, 1, [ 10, 20, 30 ])
    return instance


@pytest.mark.asyncio
async def test_undo_edit_appending_rows(plain_instance: Instance, coms: FakeComs):
    """an edit below the data set appends rows; undo removes them, redo restores them"""
    dataset = plain_instance.project.get_dataset()
    response = await _set_ints(plain_instance, coms, 2, 1, [ 300, 400, 500 ])
    assert _rects(response) == [ (2, 3, 1, 1) ]
    assert _values(plain_instance, 'B') == [ 10, 20, 300, 400, 500 ]

    response = await _op(plain_instance, coms, 'UNDO')
    assert dataset.row_count == 3
    assert _values(plain_instance, 'B') == [ 10, 20, 30 ]

    await _op(plain_instance, coms, 'REDO')
    assert _values(plain_instance, 'B') == [ 10, 20, 300, 400, 500 ]


@pytest.mark.asyncio
async def test_undo_row_deletion(plain_instance: Instance, coms: FakeComs):
    """undoing a row deletion restores the rows and their values"""
    request = _set_request()
    row_data = request.rows.add()
    row_data.rowStart = 1
    row_data.rowCount = 1
    row_data.action = jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE')
    await _send(plain_instance, coms, request)
    assert _values(plain_instance, 'B') == [ 10, 30 ]

    await _op(plain_instance, coms, 'UNDO')
    assert _values(plain_instance, 'A') == [ 1, 2, 3 ]
    assert _values(plain_instance, 'B') == [ 10, 20, 30 ]


@pytest.mark.asyncio
async def test_undo_column_deletion(plain_instance: Instance, coms: FakeComs):
    """undoing a column deletion restores the column and its values"""
    dataset = plain_instance.project.get_dataset()
    request = _set_request()
    request.incSchema = True
    request.schema.filtersVisible = True
    column_pb = request.schema.columns.add()
    column_pb.id = dataset.get_column_by_name('A').id
    column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')
    await _send(plain_instance, coms, request)
    assert dataset[0].name == 'B'

    await _op(plain_instance, coms, 'UNDO')
    assert _values(plain_instance, 'A') == [ 1, 2, 3 ]
    assert _values(plain_instance, 'B') == [ 10, 20, 30 ]
