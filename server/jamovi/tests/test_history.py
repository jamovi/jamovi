"""Tests for the project-wide undo/redo History."""

import pytest

from jamovi.server import jamovi_pb2 as jcoms
from jamovi.server.history import History
from jamovi.server.history import AnalysisOptionsChange
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


class Restorer:
    """Stands in for Instance._restore_options()."""

    def __init__(self):
        self.restored = [ ]

    def __call__(self, analysis_id, current, target):
        self.restored.append((analysis_id, target))


def _options_change(restore, before, after, time, analysis_id=2):
    return AnalysisOptionsChange(analysis_id, { 'x': before }, { 'x': after }, time, restore)


@pytest.mark.asyncio
async def test_quick_changes_to_an_analysis_are_merged():
    restore = Restorer()
    history = History()
    history.add(_options_change(restore, 1, 2, time=0.0))
    history.add(_options_change(restore, 2, 3, time=0.5))
    history.add(_options_change(restore, 3, 4, time=1.2))

    assert history.position == 1
    await history.undo()
    assert restore.restored == [ (2, { 'x': 1 }) ]


@pytest.mark.asyncio
async def test_slow_changes_to_an_analysis_are_kept_apart():
    restore = Restorer()
    history = History()
    history.add(_options_change(restore, 1, 2, time=0.0))
    history.add(_options_change(restore, 2, 3, time=5.0))
    assert history.position == 2


def test_changes_to_different_analyses_are_kept_apart():
    restore = Restorer()
    history = History()
    history.add(_options_change(restore, 1, 2, time=0.0, analysis_id=2))
    history.add(_options_change(restore, 1, 2, time=0.1, analysis_id=4))
    assert history.position == 2


@pytest.mark.asyncio
async def test_a_change_after_an_undo_is_not_merged():
    restore = Restorer()
    history = History()
    history.add(_options_change(restore, 1, 2, time=0.0))
    history.add(_options_change(restore, 2, 3, time=5.0))
    await history.undo()
    history.add(_options_change(restore, 2, 9, time=5.1))

    assert history.position == 2
    await history.undo()
    assert restore.restored[-1] == (2, { 'x': 2 })


def test_changing_back_quickly_leaves_no_entry():
    restore = Restorer()
    history = History()
    history.add(_options_change(restore, 1, 2, time=0.0))
    history.add(_options_change(restore, 2, 1, time=0.2))
    assert history.position == 0
    assert history.count == 1


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


def _annotate(analysis_id, revision, text):
    request = jcoms.AnalysisRequest()
    request.analysisId = analysis_id
    request.name = 'empty'
    request.ns = 'jmv'
    request.revision = revision
    request.options.hasNames = True
    request.options.names.append('results//topText')
    request.options.options.add().s = text
    # the extras the client sends with every request don't count
    request.options.names.append('.ppi')
    request.options.options.add().i = 72 + revision
    return request


@pytest.mark.asyncio
async def test_instance_undoes_and_redoes_option_changes(instance: Instance, monkeypatch):
    # every request counts as a separate change
    monkeypatch.setattr(AnalysisOptionsChange, 'MERGE_WITHIN', -1)

    await _open(instance)
    coms = FakeComs()
    instance.set_coms(coms)
    header = next(iter(instance.project.analyses))

    await instance.on_request(_annotate(header.id, 1, 'first'))
    await instance.on_request(_annotate(header.id, 2, 'second'))
    assert coms.sent[-1].changesPosition == 2

    # resending the same options (with different extras) isn't a change
    n_sent = len(coms.sent)
    await instance.on_request(_annotate(header.id, 3, 'second'))
    assert coms.sent[n_sent:] == [ None ]  # just the reply to the request

    await instance.on_request(_op('UNDO'))
    assert header.options.get_value('results//topText') == 'first'
    sent = [ msg for msg in coms.sent if isinstance(msg, jcoms.AnalysisResponse) ]
    assert sent[-1].analysisId == header.id
    assert sent[-1].restored  # so the client takes them, whatever its revision
    assert not header.results.restored  # but isn't kept, or saved
    assert coms.sent[-1].changesPosition == 1

    await instance.on_request(_op('UNDO'))
    assert header.options.get_value('results//topText') is None
    # the client only removes the annotation if it's sent as null
    sent = [ msg for msg in coms.sent if isinstance(msg, jcoms.AnalysisResponse) ]
    names = list(sent[-1].options.names)
    assert 'results//topText' in names
    assert sent[-1].options.options[names.index('results//topText')].HasField('o')
    # and the cleared annotation isn't counted as a value
    assert 'results//topText' not in header.options.get_user_values()

    await instance.on_request(_op('REDO'))
    await instance.on_request(_op('REDO'))
    assert header.options.get_value('results//topText') == 'second'
    assert coms.errors == [ ]


@pytest.mark.asyncio
async def test_data_and_option_changes_share_one_history(instance: Instance, monkeypatch):
    monkeypatch.setattr(AnalysisOptionsChange, 'MERGE_WITHIN', -1)

    await _open(instance)
    coms = FakeComs()
    instance.set_coms(coms)
    header = next(iter(instance.project.analyses))
    dataset = instance.project.get_dataset()

    await instance.on_request(_set_cell(0, 0, 7))
    await instance.on_request(_annotate(header.id, 1, 'note'))
    await instance.on_request(_set_cell(0, 0, 8))

    await instance.on_request(_op('UNDO'))
    assert dataset[0][0] == 7
    assert header.options.get_value('results//topText') == 'note'

    await instance.on_request(_op('UNDO'))
    assert dataset[0][0] == 7
    assert header.options.get_value('results//topText') is None

    await instance.on_request(_op('UNDO'))
    assert dataset.row_count == 0
    assert coms.errors == [ ]


@pytest.mark.asyncio
async def test_changes_marked_no_undo_are_not_added(instance: Instance, monkeypatch):
    monkeypatch.setattr(AnalysisOptionsChange, 'MERGE_WITHIN', -1)

    await _open(instance)
    coms = FakeComs()
    instance.set_coms(coms)
    header = next(iter(instance.project.analyses))

    await instance.on_request(_annotate(header.id, 1, 'first'))
    await instance.on_request(_op('UNDO'))

    # the options panel updating options in response to the undo
    request = _annotate(header.id, 2, 'derived')
    request.noUndo = True
    await instance.on_request(request)

    assert header.options.get_value('results//topText') == 'derived'
    await instance.on_request(_op('REDO'))
    assert header.options.get_value('results//topText') == 'first'
    assert coms.errors == [ ]
