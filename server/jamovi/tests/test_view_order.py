"""Tests for edits made while the view order differs from the data order.

When filtered rows are hidden, view row n is not data row n; edits, undo
and redo must all land on the data rows the user actually edited.
"""

import pytest
import pytest_asyncio

from jamovi.core import MeasureType
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
    assert dataset.get_data_indices(0, 3) == [ 3, 4, 5 ]
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


# sorting


async def _set_values(instance: Instance, coms: FakeComs, row_start: int, column_start: int, values: list):
    request = _set_request()
    request.incData = True
    block = request.data.add()
    block.rowStart = row_start
    block.columnStart = column_start
    block.rowCount = len(values)
    block.columnCount = 1
    for value in values:
        cell = block.values.add()
        if value is None:
            cell.o = jcoms.SpecialValues.Value('MISSING')
        elif isinstance(value, float):
            cell.d = value
        elif isinstance(value, str):
            cell.s = value
        else:
            cell.i = value
    return await _send(instance, coms, request)


async def _sort(instance: Instance, coms: FakeComs, *keys: tuple[str, bool]):
    dataset = instance.project.get_dataset()
    request = _set_request()
    request.incSchema = True
    request.schema.filtersVisible = dataset.filters_visible
    request.schema.sort.SetInParent()
    for name, descending in keys:
        key_pb = request.schema.sort.keys.add()
        key_pb.columnId = dataset.get_column_by_name(name).id
        key_pb.descending = descending
    return await _send(instance, coms, request)


def _view_order(instance: Instance) -> list[int]:
    dataset = instance.project.get_dataset()
    return dataset.get_data_indices(0, dataset.view_row_count)


@pytest_asyncio.fixture
async def sortable_instance(instance: Instance, coms: FakeComs) -> Instance:
    """A = 1..4, B = 3.5, 1.5, (missing), 2.5"""
    await _open(instance)
    instance.set_coms(coms)
    await _set_values(instance, coms, 0, 0, [ 1, 2, 3, 4 ])
    await _set_values(instance, coms, 0, 1, [ 3.5, 1.5, None, 2.5 ])
    return instance


@pytest.mark.asyncio
async def test_sort_ascending(sortable_instance: Instance, coms: FakeComs):
    """rows display in ascending order, missing values last"""
    response = await _sort(sortable_instance, coms, ('B', False))
    assert response.viewOrderChanged
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]
    dataset = sortable_instance.project.get_dataset()
    assert [ (key.columnId, key.descending) for key in response.schema.sort.keys ] == dataset.sort_keys
    assert response.schema.vRowCount == 4 + 50  # blank rows beneath, for entering data


@pytest.mark.asyncio
async def test_sort_descending(sortable_instance: Instance, coms: FakeComs):
    """rows display in descending order, missing values still last"""
    await _sort(sortable_instance, coms, ('B', True))
    assert _view_order(sortable_instance) == [ 0, 3, 1, 2 ]


@pytest.mark.asyncio
async def test_sort_is_stable(sortable_instance: Instance, coms: FakeComs):
    """tied rows retain the data set order, in either direction"""
    await _set_values(sortable_instance, coms, 0, 1, [ 2.0, 1.0, 2.0, 1.0 ])
    await _sort(sortable_instance, coms, ('B', False))
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]
    await _sort(sortable_instance, coms, ('B', True))
    assert _view_order(sortable_instance) == [ 0, 2, 1, 3 ]


@pytest.mark.asyncio
async def test_sort_by_several_columns(sortable_instance: Instance, coms: FakeComs):
    """later keys order the rows tied on earlier keys"""
    await _set_values(sortable_instance, coms, 0, 1, [ 2.0, 1.0, 2.0, 1.0 ])
    await _sort(sortable_instance, coms, ('B', False), ('A', True))
    assert _view_order(sortable_instance) == [ 3, 1, 2, 0 ]


@pytest.mark.asyncio
async def test_sort_integers_by_value(sortable_instance: Instance, coms: FakeComs):
    """nominal integers sort by value, whatever the order of their levels"""
    await _set_values(sortable_instance, coms, 0, 2, [ 20, 3, 100, 3 ])
    column = sortable_instance.project.get_dataset().get_column_by_name('C')
    assert column.measure_type is MeasureType.NOMINAL
    await _sort(sortable_instance, coms, ('C', False))
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]


@pytest.mark.asyncio
async def test_sort_text_by_label(sortable_instance: Instance, coms: FakeComs):
    """nominal text sorts by label, whatever the order of its levels"""
    await _set_values(sortable_instance, coms, 0, 2, [ 'b', 'a', 'c', 'a' ])
    column = sortable_instance.project.get_dataset().get_column_by_name('C')
    assert [ level[1] for level in column.levels ] == [ 'b', 'a', 'c' ]
    await _sort(sortable_instance, coms, ('C', False))
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]


@pytest.mark.asyncio
async def test_sort_ordinal_by_level_order(sortable_instance: Instance, coms: FakeComs):
    """ordinal columns sort by the order of their levels"""
    await _set_values(sortable_instance, coms, 0, 2, [ 'b', 'a', 'c', 'a' ])
    column = sortable_instance.project.get_dataset().get_column_by_name('C')
    column.change(measure_type=MeasureType.ORDINAL)
    await _sort(sortable_instance, coms, ('C', False))
    assert [ column[row] for row in _view_order(sortable_instance) ] == [ 'b', 'a', 'a', 'c' ]


@pytest.mark.asyncio
async def test_unsort(sortable_instance: Instance, coms: FakeComs):
    """an empty sort displays rows in data set order"""
    await _sort(sortable_instance, coms, ('B', False))
    response = await _sort(sortable_instance, coms)
    assert response.viewOrderChanged
    assert not sortable_instance.project.get_dataset().is_view_remapped
    assert _view_order(sortable_instance) == [ 0, 1, 2, 3 ]


@pytest.mark.asyncio
async def test_get_cells_while_sorted(sortable_instance: Instance, coms: FakeComs):
    """cells are served in view order, with their data set row numbers"""
    await _sort(sortable_instance, coms, ('B', False))
    request = jcoms.DataSetRR()
    request.op = jcoms.GetSet.Value('GET')
    request.incData = True
    block = request.data.add()
    block.rowStart = 0
    block.rowCount = 4
    block.columnStart = 0
    block.columnCount = 1
    response = await _send(sortable_instance, coms, request)
    assert list(response.rows[0].rowNums) == [ 1, 3, 0, 2 ]
    assert _block_ints(response.data[0]) == [ 2, 4, 1, 3 ]


@pytest.mark.asyncio
async def test_edit_while_sorted(sortable_instance: Instance, coms: FakeComs):
    """an edit lands on the displayed row, and the rows are re-sorted"""
    await _sort(sortable_instance, coms, ('B', False))
    response = await _set_values(sortable_instance, coms, 0, 1, [ 10.0 ])  # data row 1
    assert _values(sortable_instance, 'B')[1] == 10.0
    assert response.viewOrderChanged
    assert _view_order(sortable_instance) == [ 3, 0, 1, 2 ]

    response = await _set_values(sortable_instance, coms, 0, 0, [ 100 ])  # data row 3
    assert _values(sortable_instance, 'A') == [ 1, 2, 3, 100 ]
    assert not response.viewOrderChanged


@pytest.mark.asyncio
async def test_undo_edit_while_sorted(sortable_instance: Instance, coms: FakeComs):
    """undoing an edit that moved a row restores it, and reports where it's displayed now"""
    await _sort(sortable_instance, coms, ('B', False))
    await _set_values(sortable_instance, coms, 0, 1, [ 10.0 ])  # data row 1, moves to view row 2

    response = await _op(sortable_instance, coms, 'UNDO')
    assert _values(sortable_instance, 'B')[1] == 1.5
    assert response.viewOrderChanged
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]
    assert _rects(response) == [ (0, 1, 1, 1) ]  # data row 1 is back at view row 0

    await _op(sortable_instance, coms, 'REDO')
    assert _values(sortable_instance, 'B')[1] == 10.0


@pytest.mark.asyncio
async def test_undo_sort(sortable_instance: Instance, coms: FakeComs):
    """sorting can be undone and redone"""
    await _sort(sortable_instance, coms, ('B', False))
    response = await _op(sortable_instance, coms, 'UNDO')
    assert response.viewOrderChanged
    assert len(response.schema.sort.keys) == 0
    assert _view_order(sortable_instance) == [ 0, 1, 2, 3 ]

    await _op(sortable_instance, coms, 'REDO')
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]


@pytest.mark.asyncio
async def test_rows_cannot_be_inserted_while_sorted(sortable_instance: Instance, coms: FakeComs):
    await _sort(sortable_instance, coms, ('B', False))
    request = _set_request()
    row_data = request.rows.add()
    row_data.rowStart = 1
    row_data.rowCount = 1
    row_data.action = jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT')
    await sortable_instance.on_request(request)
    assert len(coms.errors) == 1
    assert sortable_instance.project.get_dataset().row_count == 4


@pytest.mark.asyncio
async def test_deleting_the_sort_column(sortable_instance: Instance, coms: FakeComs):
    """deleting the sort column unsorts; undoing the deletion restores the sort"""
    dataset = sortable_instance.project.get_dataset()
    await _sort(sortable_instance, coms, ('B', False))
    request = _set_request()
    request.incSchema = True
    request.schema.filtersVisible = True
    column_pb = request.schema.columns.add()
    column_pb.id = dataset.get_column_by_name('B').id
    column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')
    response = await _send(sortable_instance, coms, request)
    assert not dataset.is_sorted
    assert response.viewOrderChanged

    await _op(sortable_instance, coms, 'UNDO')
    assert _values(sortable_instance, 'B') == pytest.approx([ 3.5, 1.5, float('nan'), 2.5 ], nan_ok=True)
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]


@pytest.mark.asyncio
async def test_sort_with_filtered_rows_hidden(filtered_instance: Instance, coms: FakeComs):
    """sorting applies to the rows that remain displayed"""
    await _sort(filtered_instance, coms, ('B', True))
    assert _view_order(filtered_instance) == [ 5, 4, 3 ]
    await _set_filters_visible(filtered_instance, coms, True)
    assert _view_order(filtered_instance) == [ 5, 4, 3, 2, 1, 0 ]



@pytest.mark.asyncio
async def test_sort_empty_data_set(instance: Instance, coms: FakeComs):
    """an empty data set can be sorted, and data entered into it"""
    await _open(instance)
    instance.set_coms(coms)
    await _set_values(instance, coms, 0, 0, [ 1 ])
    await _op(instance, coms, 'UNDO')  # A now exists, with no rows
    dataset = instance.project.get_dataset()
    assert dataset.row_count == 0

    response = await _sort(instance, coms, ('A', False))
    assert response.schema.vRowCount == 50

    await _set_values(instance, coms, 0, 0, [ 3, 1, 2 ])
    assert _values(instance, 'A') == [ 3, 1, 2 ]
    assert _view_order(instance) == [ 1, 2, 0 ]


@pytest.mark.asyncio
async def test_enter_data_beneath_while_sorted(sortable_instance: Instance, coms: FakeComs):
    """data entered beneath the sorted rows is appended, sorted, and can be undone"""
    await _sort(sortable_instance, coms, ('B', False))
    response = await _set_values(sortable_instance, coms, 4, 1, [ 0.5 ])
    assert _values(sortable_instance, 'B')[4] == 0.5
    assert _view_order(sortable_instance) == [ 4, 1, 3, 0, 2 ]
    assert response.schema.vRowCount == 5 + 50

    await _op(sortable_instance, coms, 'UNDO')
    assert sortable_instance.project.get_dataset().row_count == 4
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2 ]

    await _op(sortable_instance, coms, 'REDO')
    assert _view_order(sortable_instance) == [ 4, 1, 3, 0, 2 ]


@pytest.mark.asyncio
async def test_append_rows_while_sorted(sortable_instance: Instance, coms: FakeComs):
    """rows can be appended while sorted (they sort last), and the append undone"""
    await _sort(sortable_instance, coms, ('B', False))
    request = _set_request()
    row_data = request.rows.add()
    row_data.rowStart = 4
    row_data.rowCount = 2
    row_data.action = jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT')
    await _send(sortable_instance, coms, request)
    assert sortable_instance.project.get_dataset().row_count == 6
    assert _view_order(sortable_instance) == [ 1, 3, 0, 2, 4, 5 ]

    await _op(sortable_instance, coms, 'UNDO')
    assert sortable_instance.project.get_dataset().row_count == 4


@pytest.mark.asyncio
async def test_sort_by_filter(filtered_instance: Instance, coms: FakeComs):
    """rows can be sorted by whether a filter keeps them, live"""
    await _set_filters_visible(filtered_instance, coms, True)
    filter_name = filtered_instance.project.get_dataset()[0].name
    await _sort(filtered_instance, coms, (filter_name, True))
    assert _view_order(filtered_instance) == [ 3, 4, 5, 0, 1, 2 ]

    await _set_ints(filtered_instance, coms, 3, 1, [ 10 ])  # view row 3 is data row 0
    assert _values(filtered_instance, 'A')[0] == 10
    assert _view_order(filtered_instance) == [ 0, 3, 4, 5, 1, 2 ]
