"""Tests for the Instance / Project / DataSetController wiring.

These drive an Instance the way the client does: open a file, send DataSetRR
requests, save, and read the result back.
"""

from os import path
import struct

import pytest

from jamovi.server import jamovi_pb2 as jcoms
from jamovi.server.instance import Instance
from jamovi.server.session import Session


class FakeComs:
    """Records what the instance sends, in place of a websocket."""

    def __init__(self):
        self.sent = [ ]
        self.errors = [ ]

    def send(self, message=None, instance_id=None, response_to=None,
             complete=True, progress=(0, 0), status=None):
        self.sent.append(message)

    def send_error(self, message=None, cause=None, instance_id=None, response_to=None):
        self.errors.append((message, cause))

    def add_close_listener(self, listener):
        pass

    def remove_close_listener(self, listener):
        pass


async def _open(instance: Instance, file_path: str = '', **kwargs):
    stream = instance.open(file_path, **kwargs)
    async for _ in stream:
        pass
    return await stream


async def _save(instance: Instance, file_path: str):
    stream = instance.save({ 'path': file_path, 'overwrite': True })
    async for _ in stream:
        pass
    return await stream


@pytest.fixture
def coms() -> FakeComs:
    return FakeComs()


@pytest.mark.asyncio
async def test_open_blank(instance: Instance):
    """opening '' produces an untitled project with one blank data set"""
    await _open(instance)

    project = instance.project
    assert project.has_datasets
    assert project.title == 'Untitled'
    assert project.is_blank
    assert not project.is_edited

    dataset = project.get_dataset()
    assert dataset.id == 1
    assert dataset.column_count == 3
    assert dataset.row_count == 0
    assert [ c.name for c in dataset ][:3] == [ 'A', 'B', 'C' ]

    # the results header annotation is created on open
    assert project.analyses.count() == 1
    assert project.analyses.has_header_annotation()


@pytest.mark.asyncio
async def test_dataset_set_and_info(instance: Instance, coms: FakeComs):
    """a DataSetRR SET goes through the controller, and is reflected in InfoResponse"""
    await _open(instance)
    instance.set_coms(coms)

    request = jcoms.DataSetRR()
    request.op = jcoms.GetSet.Value('SET')
    request.incData = True
    block = request.data.add()
    block.rowStart = 0
    block.columnStart = 0
    block.rowCount = 2
    block.columnCount = 1
    block.values.add().i = 7
    block.values.add().i = 9

    await instance.on_request(request)

    assert coms.errors == [ ]
    response = coms.sent[-1]
    assert isinstance(response, jcoms.DataSetRR)
    assert response.changesPosition == 1

    dataset = instance.project.get_dataset()
    assert dataset.row_count == 2
    assert dataset[0][0] == 7
    assert dataset[0][1] == 9
    assert instance.project.is_edited

    await instance.on_request(jcoms.InfoRequest())
    info = coms.sent[-1]
    assert isinstance(info, jcoms.InfoResponse)
    assert info.hasDataSet
    assert info.title == 'Untitled'
    assert info.edited
    assert info.changesPosition == 1
    assert info.schema.rowCount == 2
    assert info.schema.columnCount == 3
    assert len(info.schema.columns) == dataset.total_column_count
    assert len(info.analyses) == 1

    # undo goes back through the same controller
    undo = jcoms.DataSetRR()
    undo.op = jcoms.GetSet.Value('UNDO')
    await instance.on_request(undo)
    assert coms.errors == [ ]
    assert coms.sent[-1].changesPosition == 0
    assert dataset.row_count == 0


@pytest.mark.asyncio
async def test_save_and_reopen_omv(instance: Instance, coms: FakeComs, temp_dir: str, session: Session):
    """a project survives a round trip through an .omv"""
    await _open(instance)
    instance.set_coms(coms)

    request = jcoms.DataSetRR()
    request.op = jcoms.GetSet.Value('SET')
    request.incData = True
    block = request.data.add()
    block.rowStart = 0
    block.columnStart = 1
    block.rowCount = 3
    block.columnCount = 1
    for value in ('x', 'y', 'x'):
        block.values.add().s = value
    await instance.on_request(request)
    assert coms.errors == [ ]

    omv_path = path.join(temp_dir, 'round-trip.omv')
    result = await _save(instance, omv_path)
    assert result['title'] == 'round-trip'
    assert instance.project.title == 'round-trip'
    assert instance.project.path == omv_path
    assert instance.project.save_format == 'jamovi'
    assert not instance.project.is_edited

    reopened = await session.create()
    await _open(reopened, omv_path)
    project = reopened.project
    assert project.title == 'round-trip'
    assert project.path == omv_path
    assert not project.is_blank

    dataset = project.get_dataset()
    assert dataset.column_count == 3
    assert dataset.row_count == 3
    assert [ dataset[1][i] for i in range(3) ] == [ 'x', 'y', 'x' ]
    assert project.analyses.has_header_annotation()

    reopened.close()


@pytest.mark.asyncio
async def test_open_failure_leaves_no_dataset(instance: Instance, temp_dir: str):
    """a failed open removes the data set it was reading into"""
    with pytest.raises(FileNotFoundError):
        await _open(instance, path.join(temp_dir, 'does-not-exist.csv'))
    assert not instance.project.has_datasets

