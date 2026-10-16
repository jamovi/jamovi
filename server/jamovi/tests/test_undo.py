"""Tests for undo and redo"""

import pytest

from jamovi.core import ColumnType
from jamovi.server.instance import Instance

from jamovi.tests.test_instance import FakeComs, _open
from jamovi.tests.test_view_order import _set_values, _op, _values


@pytest.fixture
def coms() -> FakeComs:
    return FakeComs()


@pytest.mark.asyncio
async def test_undo_after_output_column_removed(instance: Instance, coms: FakeComs):
    """undo works after an analysis removes an output column it had added

    output columns are added and removed by analyses, outside of the undo
    history, so the history can refer to columns which no longer exist
    """
    await _open(instance)
    instance.set_coms(coms)
    await _set_values(instance, coms, 0, 0, [ 1, 2, 3 ])

    # as an analysis adds an output column
    dataset = instance.project.get_dataset()
    output = dataset.insert_column(dataset.column_count, 'Residuals')
    output.column_type = ColumnType.OUTPUT

    await _set_values(instance, coms, 0, 0, [ 10 ])
    await _set_values(instance, coms, 1, 0, [ 20 ])
    position = coms.sent[-1].changesPosition

    # as the analysis removes it
    dataset.delete_columns_by_id([ output.id ])

    response = await _op(instance, coms, 'UNDO')
    assert response.changesPosition == position - 1
    assert _values(instance, 'A') == [ 10, 2, 3 ]

    response = await _op(instance, coms, 'UNDO')
    assert response.changesPosition == position - 2
    assert _values(instance, 'A') == [ 1, 2, 3 ]

    await _op(instance, coms, 'REDO')
    await _op(instance, coms, 'REDO')
    assert _values(instance, 'A') == [ 10, 20, 3 ]
