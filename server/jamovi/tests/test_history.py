"""Tests for the project-wide undo/redo History."""

import pytest

from jamovi.server import jamovi_pb2 as jcoms
from jamovi.server.history import History
from jamovi.server.instance import Instance

from .test_instance import FakeComs
from .test_instance import _open


class FakeChange:
    """Records its undos and redos in a shared log."""

    def __init__(self, name, log):
        self.name = name
        self.log = log

    async def undo(self):
        self.log.append(('undo', self.name))
        return self.name

    async def redo(self):
        self.log.append(('redo', self.name))
        return self.name


@pytest.mark.asyncio
async def test_undo_and_redo_walk_the_entries_in_order():
    log = [ ]
    history = History()
    history.add(FakeChange('a', log))
    history.add(FakeChange('b', log))

    assert await history.undo() == [ 'b' ]
    assert await history.undo() == [ 'a' ]
    assert await history.undo() == [ ]
    assert await history.redo() == [ 'a' ]
    assert await history.redo() == [ 'b' ]
    assert await history.redo() == [ ]

    assert log == [ ('undo', 'b'), ('undo', 'a'), ('redo', 'a'), ('redo', 'b') ]


@pytest.mark.asyncio
async def test_the_changes_in_an_entry_are_undone_in_reverse():
    log = [ ]
    history = History()
    history.add(FakeChange('a', log), FakeChange('b', log))

    await history.undo()
    await history.redo()

    assert log == [ ('undo', 'b'), ('undo', 'a'), ('redo', 'a'), ('redo', 'b') ]


@pytest.mark.asyncio
async def test_adding_discards_what_could_be_redone():
    log = [ ]
    history = History()
    history.add(FakeChange('a', log))
    history.add(FakeChange('b', log))
    await history.undo()
    history.add(FakeChange('c', log))

    assert not history.can_redo
    assert await history.undo() == [ 'c' ]
    assert await history.undo() == [ 'a' ]


def test_count_and_position_follow_modtrackers_numbering():
    history = History()
    assert (history.count, history.position) == (1, 0)
    history.add(FakeChange('a', [ ]))
    assert (history.count, history.position) == (2, 1)


def test_the_oldest_entries_are_dropped_beyond_the_maximum(monkeypatch):
    monkeypatch.setattr(History, 'MAX_LENGTH', 2)
    history = History()
    for name in 'abc':
        history.add(FakeChange(name, [ ]))
    assert history.count == 3
    assert history.position == 2


def _set_cell(row, column, value):
    request = jcoms.DataSetRR()
    request.op = jcoms.GetSet.Value('SET')
    request.incData = True
    block = request.data.add()
    block.rowStart = row
    block.columnStart = column
    block.rowCount = 1
    block.columnCount = 1
    block.values.add().i = value
    return request


def _op(name):
    request = jcoms.DataSetRR()
    request.op = jcoms.GetSet.Value(name)
    return request


@pytest.mark.asyncio
async def test_instance_undoes_and_redoes_data_set_edits(instance: Instance):
    await _open(instance)
    coms = FakeComs()
    instance.set_coms(coms)
    dataset = instance.project.get_dataset()

    await instance.on_request(_set_cell(0, 0, 7))
    await instance.on_request(_set_cell(0, 1, 9))
    assert coms.sent[-1].changesPosition == 2

    await instance.on_request(_op('UNDO'))
    assert dataset[1][0] != 9
    assert dataset[0][0] == 7
    assert coms.sent[-1].changesPosition == 1

    await instance.on_request(_op('REDO'))
    assert dataset[1][0] == 9
    assert coms.sent[-1].changesPosition == 2

    # a new edit after an undo discards the redo
    await instance.on_request(_op('UNDO'))
    await instance.on_request(_set_cell(0, 2, 3))
    assert coms.sent[-1].changesPosition == 2
    assert coms.sent[-1].changesCount == 3
    await instance.on_request(_op('REDO'))
    assert dataset[1][0] != 9

    assert coms.errors == [ ]


@pytest.mark.asyncio
async def test_undo_with_nothing_to_undo_is_harmless(instance: Instance):
    await _open(instance)
    coms = FakeComs()
    instance.set_coms(coms)

    await instance.on_request(_op('UNDO'))

    assert coms.errors == [ ]
    assert coms.sent[-1].changesPosition == 0
