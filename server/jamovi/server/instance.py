#
# Copyright (C) 2016 Jonathon Love
#

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType
from jamovi.core import Dirs
from jamovi.core import MemoryMap
from jamovi.core import DataSet

from .settings import Settings

from . import jamovi_pb2 as jcoms
from .jamovi_pb2 import Notification

from .utils import conf
from .utils import FileEntry
from .utils import CSVParser
from .utils import HTMLParser
from .utils import ssl_context
from .utils.stream import ProgressStream
from .modules import Modules
from .instancemodel import InstanceModel
from . import formatio
from .modtracker import ModTracker
from .permissions import Permissions
from .integrations import get_special_handler

import os
import os.path
import platform
import re
import posixpath
import math
import yaml
import logging
import asyncio
import functools
from time import monotonic
from itertools import islice
from urllib import parse
from aiohttp import ClientSession
from asyncio import ensure_future as create_task
from collections import namedtuple

from tempfile import NamedTemporaryFile
from tempfile import mktemp
from tempfile import mkstemp

from .utils import fs
from .utils import is_int32
from .utils import is_url
from .utils import latexify


log = logging.getLogger(__name__)


# until we deploy the windows updater and are happy with it,
# we'll default autoUpdate to off -- macOS works well though.
is_windows = platform.uname().system == 'Windows'
def4ult = False if is_windows else True
Settings.retrieve('main').specify_default('autoUpdate', def4ult)


class ForbiddenOp(PermissionError):
    def __init__(self, operation, message):
        super().__init__(message)
        self.operation = operation


ConnectionStatus = namedtuple('ConnectionStatus',
    ('connected', 'inactive_since', 'unclean', 'virgin'),
    defaults=(True, None, False, False))


class Instance:

    def __init__(self, session, instance_path, instance_id):

        self._session = session
        self._instance_path = instance_path
        self._instance_id = instance_id

        os.makedirs(instance_path, exist_ok=True)
        self._buffer_path = posixpath.join(instance_path, 'buffer')

        self._mm = None
        self._data = InstanceModel(self)
        self._coms = None
        self._perms = Permissions.retrieve()
        self._mod_tracker = ModTracker(self._data)

        now = monotonic()

        self._virgin = True
        self._idle_since = now
        self._no_connection_since = now
        self._no_connection_unclean_disconnect = False

        self._data.analyses.add_results_changed_listener(self._on_results)
        self._data.analyses.add_output_received_listener(self._on_output_received)

        settings = Settings.retrieve()
        settings.sync()

        Modules.instance().add_listener(self._module_event)

        handler = Instance.LogHandler(self)
        handler.setLevel('DEBUG')
        self._log = logging.getLogger(instance_id)
        self._log.propagate = False
        self._log.setLevel('DEBUG')
        self._log.addHandler(handler)
        self._data.set_log(self._log)

    @property
    def id(self):
        return self._instance_id

    @property
    def session(self):
        return self._session

    def _normalise_path(self, path):
        nor_path = path
        if path.startswith('{{Temp}}'):
            base = os.path.basename(path)
            base, ext = os.path.splitext(base)
            temp_path = self.temp_path()
            os.makedirs(temp_path, exist_ok=True)
            nor_path = mktemp(suffix=ext, dir=temp_path)
        elif path.startswith('{{Documents}}'):
            nor_path = path.replace('{{Documents}}', Dirs.documents_dir())
        elif path.startswith('{{Downloads}}'):
            nor_path = path.replace('{{Downloads}}', Dirs.downloads_dir())
        elif path.startswith('{{Desktop}}'):
            nor_path = path.replace('{{Desktop}}', Dirs.desktop_dir())
        elif path.startswith('{{Home}}'):
            nor_path = path.replace('{{Home}}', Dirs.home_dir())
        elif path.startswith('{{Examples}}'):
            modules = Modules.instance()
            if path == '{{Examples}}':
                module = modules['jmv']
                nor_path = posixpath.join(module.path, 'data')
            else:
                if os.path.dirname(path) == '{{Examples}}':
                    module_name = 'jmv'
                else:
                    module_name = os.path.basename(os.path.dirname(path))
                # {{Examples}}/module_name/[file_name.ext]
                file_name = os.path.basename(path)
                try:
                    module = modules[module_name]
                    nor_path = posixpath.join(module.path, 'data', file_name)
                except KeyError:
                    # return something default-y, let somewhere else error
                    module = modules['jmv']
                    nor_path = posixpath.join(module.path, 'data')

        return nor_path

    def temp_path(self):
        return posixpath.join(self._instance_path, 'dl')

    def _virtualise_path(self, path):

        temp_path = self.temp_path()
        if path.startswith(temp_path):
            return path.replace(temp_path, '{{Temp}}')

        try:
            documents_dir = Dirs.documents_dir()
            if path.startswith(documents_dir):
                return path.replace(documents_dir, '{{Documents}}')
        except Exception:
            pass

        try:
            downloads_dir = Dirs.downloads_dir()
            if path.startswith(downloads_dir):
                return path.replace(downloads_dir, '{{Downloads}}')
        except Exception:
            pass

        try:
            desktop_dir = Dirs.desktop_dir()
            if path.startswith(desktop_dir):
                return path.replace(desktop_dir, '{{Desktop}}')
        except Exception:
            pass

        try:
            home_dir = Dirs.home_dir()
            if path.startswith(home_dir):
                return path.replace(home_dir, '{{Home}}')
        except Exception:
            pass

        return path

    def _module_event(self, event):
        if event['type'] == 'moduleInstalled':
            module_name = event['data']['name']

            broadcast = jcoms.ModuleRR()
            broadcast.command = jcoms.ModuleRR.ModuleCommand.Value('INSTALL')
            broadcast.name = module_name

            if self._coms is not None:
                self._coms.send(broadcast, self._instance_id)

    @property
    def instance_path(self):
        return self._instance_path

    def set_coms(self, coms):
        if self._coms is not None:
            self._coms.remove_close_listener(self._close)
        self._coms = coms
        self._coms.add_close_listener(self._close)
        self._no_connection_since = None
        self._virgin = False

    def close(self):
        Modules.instance().remove_listener(self._module_event)
        if self._mm is not None:
            self._mm.close()

    def _close(self, clean=True):
        self._coms.remove_close_listener(self._close)
        self._coms = None
        self._no_connection_unclean_disconnect = not clean
        self._no_connection_since = monotonic()

    @property
    def is_active(self):
        return self._coms is not None

    def connection_status(self):
        if self._no_connection_since is None:
            return ConnectionStatus()
        else:
            return ConnectionStatus(
                    False,
                    self._no_connection_since,
                    self._no_connection_unclean_disconnect,
                    self._virgin)

    def idle_for(self):
        return monotonic() - self._idle_since

    def idle_since(self):
        return self._idle_since

    def notify_idle(self, id, shutdown_in):

        if self._coms is None:
            return

        n = Notification()
        n.id = id

        if shutdown_in is not None:
            nearest_30secs = int(round(shutdown_in / 30) * 30)
            if nearest_30secs >= 120:
                description = f'in around { nearest_30secs // 60 } minutes'
            elif nearest_30secs >= 60:
                description = 'in around 1 minute'
            else:
                description = 'any moment now'

            n.title = 'Idle session'
            n.message = f'This session will end { description }'
            n.status = 2  # indefinite
        else:
            n.status = 1  # dismiss

        self._coms.send(n)


    @property
    def analyses(self):
        return self._data.analyses

    def get_path_to_resource(self, resourceId):
        return posixpath.join(self._instance_path, resourceId)

    async def on_request(self, request):

        self._idle_since = monotonic()

        if type(request) == jcoms.DataSetRR:
            self._on_dataset(request)
        elif type(request) == jcoms.OpenRequest:
            await self._on_open(request)
        elif type(request) == jcoms.SaveRequest:
            await self._on_save(request)
        elif type(request) == jcoms.InfoRequest:
            self._on_info(request)
        elif type(request) == jcoms.SettingsRequest:
            self._on_settings(request)
        elif type(request) == jcoms.AnalysisRequest:
            await self._on_analysis(request)
        elif type(request) == jcoms.FSRequest:
            self._on_fs_request(request)
        elif type(request) == jcoms.ModuleRR:
            await self._on_module(request)
        elif type(request) == jcoms.StoreRequest:
            await self._on_store(request)
        else:
            log.info('unrecognised request')
            log.info(request.payloadType)

    def _on_results(self, analysis):
        if self._coms is not None:
            self._coms.send(analysis.results, self._instance_id, complete=analysis.complete)

    def _on_output_received(self, outputs):

        def gen_output_column_name(desired_name):
            name = desired_name
            next_number = 2
            while True:
                # create a unique name if necessary
                for column in self._data:
                    if name == column.name:  # not unique!
                        name = f'{ desired_name } ({ next_number })'
                        next_number += 1
                        break
                else:
                    # it's unique, phew!
                    break
            return name

        try:
            response = None
            analysis_id = outputs.analysis_id

            for option_outputs in outputs.outputs:
                option_name = option_outputs.option_name

                columns_by_output_name = { }
                to_delete = [ ]

                for column in self._data:
                    if (column.column_type is ColumnType.OUTPUT
                            and column.output_analysis_id == analysis_id
                            and column.output_option_name == option_name):
                        columns_by_output_name[column.output_name] = column

                new_names = list(map(lambda x: x.name, option_outputs.outputs))

                # determine columns to delete

                for column in list(columns_by_output_name.values()):  # make a copy so we can modify the original
                    if column.output_name not in new_names:
                        del columns_by_output_name[column.output_name]
                        to_delete.append(column)

                # add new columns

                for output in option_outputs.outputs:

                    desired_name = output.title

                    if output.name not in columns_by_output_name.keys():

                        name = gen_output_column_name(desired_name)

                        column = self._data.insert_column(self._data.column_count, name)
                        column.column_type = ColumnType.OUTPUT
                        column.description = output.description
                        column.output_analysis_id = analysis_id
                        column.output_option_name = option_name
                        column.output_name = output.name
                        column.output_assigned_column_name = name
                        column.output_desired_column_name = desired_name
                    else:
                        column = columns_by_output_name[output.name]
                        if column.name == column.output_assigned_column_name:  # user hasn't changed the name
                            if column.output_desired_column_name != desired_name:  # but analysis has changed the name
                                name = gen_output_column_name(desired_name)
                                column.name = name
                                column.description = output.description
                                column.output_assigned_column_name = name
                                column.output_desired_column_name = desired_name

                    if output.values is None:
                        if output.measure_type != column.measure_type:
                            column.clear()
                            column.change(measure_type=output.measure_type)
                    elif len(output.values) == 0:
                        column.clear()
                        column.change(measure_type=output.measure_type)
                    elif isinstance(output.values[0], int):
                        column.clear()
                        column.change(data_type=DataType.INTEGER, measure_type=output.measure_type)
                        if output.measure_type is not MeasureType.CONTINUOUS:
                            for level in output.levels:
                                column.append_level(level.value, level.label)
                    elif isinstance(output.values[0], float):
                        column.change(data_type=DataType.DECIMAL, measure_type=MeasureType.CONTINUOUS)
                    else:
                        # shouldn't get here
                        continue

                    if output.values:
                        index = 0
                        n_values = len(output.values)
                        for row_no in range(column.row_count):
                            if index < n_values:
                                value = output.values[index]
                                column.set_value(row_no, value)
                                index += 1
                            else:
                                column.clear_at(row_no)

                        if column.data_type == DataType.DECIMAL:
                            column.determine_dps()

                    if response is None:
                        response = jcoms.DataSetRR()

                    column_pb = response.schema.columns.add()
                    self._populate_column_schema(column, column_pb, True)
                    column_pb.dataChanged = True

                # delete columns

                for column in to_delete:
                    if response is None:
                        response = jcoms.DataSetRR()

                    self._data.delete_columns_by_id([column.id])
                    column_pb = response.schema.columns.add()
                    column_pb.id = column.id
                    column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')

            if self._coms is not None and response is not None:
                self._populate_schema_info(None, response)
                self._coms.send(response, self._instance_id)

        except Exception as e:
            log.exception(e)

    def _on_fs_request(self, request):
        try:
            path = request.path
            extensions = request.extensions

            abs_path = path  # used by exception reporting

            try:
                if path != '':
                    path = self._virtualise_path(path)
                    abs_path = self._normalise_path(path)
                else:
                    path = '{{Documents}}'
                    abs_path = Dirs.documents_dir()
                    if os.path.exists(abs_path):
                        path = '{{Documents}}'
                    else:
                        path = '{{Root}}'
            except BaseException:
                path = '{{Root}}'
                abs_path = '/'

            response = jcoms.FSResponse()
            response.path = path
            response.osPath = abs_path

            if path.startswith('{{Root}}'):

                if self._perms.browse.local is False:
                    raise PermissionError()

                try:
                    if os.path.exists(Dirs.documents_dir()):
                        entry = response.contents.add()
                        entry.name = 'Documents'
                        entry.path = '{{Documents}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                try:
                    if os.path.exists(Dirs.downloads_dir()):
                        entry = response.contents.add()
                        entry.name = 'Downloads'
                        entry.path = '{{Downloads}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                try:
                    if os.path.exists(Dirs.desktop_dir()):
                        entry = response.contents.add()
                        entry.name = 'Desktop'
                        entry.path = '{{Desktop}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                try:
                    if os.path.exists(Dirs.home_dir()):
                        entry = response.contents.add()
                        entry.name = 'Home'
                        entry.path = '{{Home}}'
                        entry.type = jcoms.FSEntry.Type.Value('SPECIAL_FOLDER')
                except BaseException:
                    pass

                if platform.uname().system == 'Windows':
                    for drive_letter in range(ord('A'), ord('Z') + 1):
                        drive = chr(drive_letter) + ':'
                        if os.path.exists(drive):
                            entry = response.contents.add()
                            entry.name = drive
                            entry.path = drive
                            entry.type = jcoms.FSEntry.Type.Value('DRIVE')
                else:
                    entry = response.contents.add()
                    entry.name = '/'
                    entry.path = '/'
                    entry.type = jcoms.FSEntry.Type.Value('FOLDER')

                self._coms.send(response, self._instance_id, request)

            elif path.startswith('{{Examples}}'):

                if self._perms.browse.examples is False:
                    raise PermissionError()

                if path == '{{Examples}}' or path == '{{Examples}}/':
                    for module in Modules.instance():
                        if module.datasets:
                            if module.name == 'jmv':
                                for dataset in module.datasets:
                                    entry = response.contents.add()
                                    entry.name = dataset.name
                                    entry.path = posixpath.join('{{Examples}}', 'jmv', dataset.path)
                                    entry.description = dataset.description
                                    entry.tags[:] = dataset.tags
                                    entry.isExample = True
                            else:
                                entry = response.contents.add()
                                entry.name = module.title
                                entry.path = posixpath.join('{{Examples}}', module.name)
                                entry.type = jcoms.FSEntry.Type.Value('FOLDER')
                                if module.datasets_license:
                                    entry.license = module.datasets_license.name
                                    entry.licenseUrl = module.datasets_license.url
                else:
                    module_name = os.path.basename(path)
                    modules = Modules.instance()
                    try:
                        module = modules[module_name]
                        if module.datasets:
                            for dataset in module.datasets:
                                entry = response.contents.add()
                                entry.name = dataset.name
                                entry.path = posixpath.join('{{Examples}}', module_name, dataset.path)
                                entry.description = dataset.description
                                entry.tags[:] = dataset.tags
                                entry.isExample = True
                    except KeyError:
                        pass

                self._coms.send(response, self._instance_id, request)

            else:
                if self._perms.browse.local is False:
                    raise PermissionError()

                entries = [ ]

                for direntry in os.scandir(abs_path + '/'):  # add a / in case we get C:

                    show = False
                    if fs.is_hidden(direntry.path):
                        show = False
                    elif direntry.is_dir():
                        entry_type = FileEntry.Type.FOLDER
                        if fs.is_link(direntry.path):
                            show = False
                        else:
                            show = True
                    else:
                        entry_type = FileEntry.Type.FILE
                        if len(extensions) == 0:
                            show = True
                        else:
                            filename = os.path.basename(direntry.name)
                            name, ext = os.path.splitext(filename)
                            if ext != '' and ext[1:] in extensions:
                                show = True

                    if show:
                        entry = FileEntry()
                        entry.name = direntry.name
                        entry.type = entry_type
                        entry.path = posixpath.join(path, direntry.name)
                        entries.append(entry)

                entries = sorted(entries)

                for entry in entries:

                    entry_type = jcoms.FSEntry.Type.Value('FILE')
                    if entry.type is FileEntry.Type.FOLDER:
                        entry_type = jcoms.FSEntry.Type.Value('FOLDER')

                    entry_pb = response.contents.add()
                    entry_pb.name = entry.name
                    entry_pb.type = entry_type
                    entry_pb.path = entry.path

                self._coms.send(response, self._instance_id, request)

        except PermissionError as e:
            log.exception(e)
            base    = os.path.basename(abs_path)
            message = 'Unable to browse {}'.format(base)
            cause = str(e)
            if cause == '':
                cause = 'Access is denied. You may not have the appropriate permissions to access this resource.'
            self._coms.send_error(message, cause, self._instance_id, request)
        except OSError as e:
            base    = os.path.basename(abs_path)
            message = 'Unable to browse {}'.format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)
        except BaseException as e:
            base    = os.path.basename(abs_path)
            message = 'Unable to browse {}'.format(base)
            cause = str(e)
            self._coms.send_error(message, cause, self._instance_id, request)

    async def _on_save(self, request):

        path = request.filePath
        i9n = self._data.integration

        try:
            if i9n and i9n.is_for(path):

                async for progress in i9n.save(self._data, request.content):
                    self._coms.send(None, self._instance_id, request,
                                    complete=False, progress=progress)
                status = i9n.gen_message()

                response = jcoms.SaveProgress()
                response.success = True
                response.path = self._data.path
                response.title = self._data.title
                response.saveFormat = self._data.save_format
                self._coms.send(response, self._instance_id, request, status=status)

            else:
                if path.startswith('{{Temp}}'):
                    if self._perms.save.temp is False:
                        raise PermissionError()
                else:
                    if self._perms.save.local is False:
                        raise PermissionError()

                path = self._normalise_path(path)

                file_exists = os.path.isfile(path)
                if file_exists is False or request.overwrite is True:
                    if path.endswith('.omv'):
                        await self._on_save_everything(request)
                    elif request.incContent:
                        await self._on_save_content(request)
                    elif request.part != '':
                        await self._on_save_part(request)
                    else:
                        await self._on_save_everything(request)
                else:
                    response = jcoms.SaveProgress()
                    response.fileExists = True
                    response.success = False
                    self._coms.send(response, self._instance_id, request)

        except PermissionError as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to save {}'.format(base)
            cause = str(e)
            if cause == '':
                cause = 'Access is denied. You may not have the appropriate permissions to access this resource.'
            self._coms.send_error(message, cause, self._instance_id, request)

        except OSError as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to save {}'.format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)

        except BaseException as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to save {}'.format(base)
            cause = str(e)
            if not cause:
                cause = type(e).__name__
            self._coms.send_error(message, cause, self._instance_id, request)

    async def _on_save_content(self, request):
        path = request.filePath
        path = self._normalise_path(path)
        content = request.content

        if path.endswith('.zip'):  # latex bundle export

            async def resolve_image(part):
                ext = '.pdf'

                id, address = part.split('/', maxsplit=1)
                id = int(id)

                fd, temp_file_path = mkstemp(suffix=ext)
                temp_file_path = temp_file_path.replace('\\', '/')

                analysis = self.analyses.get(id)
                await analysis.save(temp_file_path, address)

                return temp_file_path

            with open(path, 'wb') as file:
                content = content.decode('utf-8')
                async for progress in latexify(content, file, resolve_image):
                    self._coms.send(None, self._instance_id, request,
                                    complete=False, progress=progress)

        else:
            with open(path, 'wb') as file:
                file.write(content)

        path = self._virtualise_path(path)

        response = jcoms.SaveProgress()
        response.path = path
        response.success = True
        self._coms.send(response, self._instance_id, request)

    async def _on_save_everything(self, request):
        path = request.filePath
        path = self._normalise_path(path)
        is_export = request.export
        content = request.content

        ioloop = asyncio.get_event_loop()

        def prog_cb(p):
            coms = self._coms
            ioloop.call_soon_threadsafe(
                functools.partial(
                    coms.send, None, self._instance_id, request,
                    complete=False, progress=(1000 * p, 1000)))

        await ioloop.run_in_executor(None, formatio.write, self._data, path, prog_cb, content)

        if not is_export:
            title = os.path.basename(path)
            title, ext = os.path.splitext(title)
            self._data.title = title
            self._data.path = path
            self._data.save_format = 'jamovi'
            self._data.is_edited = False
            self._data.integration = None

        response = jcoms.SaveProgress()
        response.success = True
        response.title = self._data.title
        response.path = self._virtualise_path(path)
        response.saveFormat = self._data.save_format
        self._coms.send(response, self._instance_id, request)

        if not is_export:
            self._add_to_recents(path, self._data.title)

    async def _on_save_part(self, request):
        path = request.filePath
        path = self._normalise_path(path)
        part = request.part

        segments = part.split('/')
        analysisId = int(segments[0])
        address = '/'.join(segments[1:])

        analysis = self.analyses.get(analysisId)

        if analysis is not None:
            try:
                await analysis.save(path, address)
            except Exception as e:
                self._coms.send_error('Unable to save', str(e), self._instance_id, request)
            else:
                path = self._virtualise_path(path)
                response = jcoms.SaveProgress()
                response.path = path
                response.success = True
                self._coms.send(response, self._instance_id, request)
        else:
            self._coms.send_error('Error', 'Unable to access analysis', self._instance_id, request)

    def open(self, path, title=None, is_temp=False, ext=None):

        is_example = path.startswith('{{Examples}}')
        if is_example:
            is_temp = True  # don't add to recents, etc.

        if is_example and self._perms.open.examples is False:
            raise PermissionError()
        if is_url(path) and self._perms.open.remote is False:
            raise PermissionError()
        if path != '' and not is_example:
            if self._perms.open.temp is False:
                raise PermissionError()
            if self._perms.open.local is False:
                temp_dir = conf.get('upload_path', None)
                # prevent directory traversal attacks
                path = os.path.join(temp_dir, path)
                if temp_dir and os.path.commonpath([ temp_dir, path ]) == temp_dir:
                    pass
                else:
                    raise PermissionError()

        stream = ProgressStream()

        async def read_file(path, is_temp, stream):

            nonlocal title
            nonlocal ext

            old_mm = None
            temp_file = None
            temp_file_path = None

            try:
                url = None
                integ_handler = None

                if is_url(path):

                    url = parse.urlsplit(path)
                    path = parse.unquote(url.path)

                    url = list(url)
                    url[2] = parse.quote(path)
                    url = parse.urlunsplit(url)

                    filename = os.path.basename(path)
                    path = url

                    integ_handler = get_special_handler(url)

                    async with ClientSession(raise_for_status=True) as session:
                        async with session.get(url, ssl=ssl_context()) as response:

                            if integ_handler is not None:
                                await integ_handler.read(response)

                            content_length = response.content_length

                            if response.content_disposition and response.content_disposition.filename:
                                filename = response.content_disposition.filename

                            if not formatio.is_supported(filename):
                                raise RuntimeError('Unrecognised file format')

                            title, dotext = os.path.splitext(filename)
                            fd, temp_file_path = mkstemp(suffix=dotext)
                            temp_file = os.fdopen(fd, 'wb')

                            if dotext != '':
                                ext = dotext[1:].lower()

                            progress = [0, 1]
                            if content_length:
                                progress = [0, 2 * content_length]  # only goes up to 50%

                            stream.write(progress)

                            async for data in response.content.iter_any():
                                temp_file.write(data)
                                if content_length:
                                    progress[0] += len(data)
                                    stream.write(progress)

                    temp_file.close()
                    norm_path = temp_file_path

                else:
                    norm_path = self._normalise_path(path)

                old_mm = self._mm
                self._mm = MemoryMap.create(self._buffer_path, 4 * 1024 * 1024)
                dataset = DataSet.create(self._mm)
                self._data.dataset = dataset

                ioloop = asyncio.get_event_loop()

                def prog_cb(p):
                    if url:  # downloaded
                        progress = (500 + 500 * p, 1000)
                    else:
                        progress = (1000 * p, 1000)
                    ioloop.call_soon_threadsafe(
                        functools.partial(
                            stream.write, progress))

                result = await ioloop.run_in_executor(None, formatio.read, self._data, norm_path, prog_cb, is_temp, title, ext)

                if integ_handler is not None:
                    self._data.integration = integ_handler
                    await integ_handler.process(self._data)

                stream.set_result(result)

                if self._data.analyses.count() == 0 or self._data.analyses._analyses[0].name != 'empty':
                    annotation = self._data.analyses.create_annotation(0)
                    annotation.results.index = 1
                    annotation.results.title = 'Results'

                i = 1
                while i < self._data.analyses.count():
                    analysis = self._data.analyses._analyses[i]

                    if analysis.name == 'empty':
                        log.info(f'Missing Analysis: { analysis.depends_on }')
                        del self._data.analyses[analysis.id]
                    else:
                        annotation_index = i + 1
                        if annotation_index == self._data.analyses.count():
                            annotation = self._data.analyses.create_annotation(annotation_index)
                            annotation.results.index = annotation_index + 1
                            analysis.add_dependent(annotation)
                        else:
                            annotation = self._data.analyses._analyses[annotation_index]
                            if annotation.name != 'empty' or annotation.depends_on != analysis.id:
                                if annotation.name == 'empty':
                                    log.info(f'Dependency miss-match: { annotation.depends_on }, { analysis.id }')
                                    del self._data.analyses[annotation.id]
                                else:
                                    log.info(f'Missing Annotation: { analysis.id }')
                                annotation = self._data.analyses.create_annotation(annotation_index)
                                annotation.results.index = annotation_index + 1
                                analysis.add_dependent(annotation)
                        i = annotation_index + 1

            except Exception as e:
                if not isinstance(e, formatio.FileReadError):
                    log.exception(e)
                self._data.dataset = None
                if self._mm:
                    self._mm.close()
                    self._mm = None
                stream.set_exception(e)
            else:
                if path != '' and not is_temp:
                    self._add_to_recents(path, self._data.title)
            finally:
                if old_mm is not None:
                    old_mm.close()
                if temp_file:
                    if not temp_file.closed:
                        temp_file.close()
                    try:
                        os.remove(temp_file_path)
                    except Exception:
                        pass

        create_task(read_file(path, is_temp, stream))
        return stream

    async def _on_open(self, request):

        if request.op == jcoms.OpenRequest.Op.Value('IMPORT_REPLACE'):
            await self._on_import(request)
            return

        path = request.filePath

        old_mm = None
        temp_file = None
        temp_file_path = None

        try:
            url = None
            title = None
            was_downloaded = False
            integ_handler = None

            if is_url(path):

                if self._perms.open.remote is False:
                    raise PermissionError()

                url = parse.urlsplit(path)
                path = parse.unquote(url.path)

                url = list(url)
                url[2] = parse.quote(path)
                url = parse.urlunsplit(url)

                filename = os.path.basename(path)
                path = url

                integ_handler = get_special_handler(url)

                async with ClientSession(raise_for_status=True) as session:
                    async with session.get(url, ssl=ssl_context()) as response:

                        if integ_handler is not None:
                            await integ_handler.read(response)

                        content_length = response.content_length

                        if response.content_disposition and response.content_disposition.filename:
                            filename = response.content_disposition.filename

                        if not formatio.is_supported(filename):
                            raise RuntimeError('Unrecognised file format')

                        title, ext = os.path.splitext(filename)
                        fd, temp_file_path = mkstemp(suffix=ext)
                        temp_file = os.fdopen(fd, 'wb')

                        if content_length:
                            progress = [ 0, 2 * content_length ]  # only goes up to 50%
                        else:
                            progress = [ 0, 1 ]
                        self._coms.send(None, self._instance_id, request, complete=False, progress=progress)

                        async for data in response.content.iter_any():
                            temp_file.write(data)
                            if content_length:
                                progress[0] += len(data)
                                self._coms.send(None, self._instance_id, request, complete=False, progress=progress)

                temp_file.close()
                norm_path = temp_file_path
                virt_path = ''
                is_example = False
                was_downloaded = True

            else:
                norm_path = self._normalise_path(path)
                virt_path = self._virtualise_path(path)
                is_example = path.startswith('{{Examples}}')

                if is_example and self._perms.open.examples is False:
                    raise PermissionError()
                if path != '' and not is_example and self._perms.open.local is False:
                    raise PermissionError()

            old_mm = self._mm
            self._mm = MemoryMap.create(self._buffer_path, 4 * 1024 * 1024)
            dataset = DataSet.create(self._mm)

            self._data.dataset = dataset

            ioloop = asyncio.get_event_loop()

            def prog_cb(p):
                coms = self._coms
                if was_downloaded:
                    progress = (500 + 500 * p, 1000)
                else:
                    progress = (1000 * p, 1000)
                ioloop.call_soon_threadsafe(
                    functools.partial(
                        coms.send, None, self._instance_id, request,
                        complete=False, progress=progress))

            await ioloop.run_in_executor(None, formatio.read, self._data, norm_path, prog_cb, is_example, title)

            if integ_handler is not None:
                self._data.integration = integ_handler
                await integ_handler.process(self._data)

            response = jcoms.OpenProgress()
            response.path = virt_path

            self._coms.send(response, self._instance_id, request)

            if path != '' and not is_example:
                self._add_to_recents(path, self._data.title)

        except PermissionError as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to open {}'.format(base)
            cause = str(e)
            if cause == '':
                cause = 'Access is denied. You may not have the appropriate permissions to access this resource.'
            self._coms.send_error(message, cause, self._instance_id, request)

        except OSError as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to open {}'.format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)

        except Exception as e:
            log.exception(e)
            base    = os.path.basename(path)
            message = 'Unable to open {}'.format(base)
            cause = str(e)
            self._coms.send_error(message, cause, self._instance_id, request)

        finally:
            if old_mm is not None:
                old_mm.close()
            if temp_file:
                if not temp_file.closed:
                    temp_file.close()
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass

    async def _on_import(self, request):

        if request.filePath != '':
            paths = [ request.filePath ]
        else:
            paths = list(request.filePaths)

        n_files = len(paths)
        coms = self._coms
        instance_id = self._instance_id
        instance = self

        # class which provides an iterator which iterates over the data sets
        class MultipleDataSets:

            # python 3.6 allows you use to use 'yield' inside async iterators.
            # unfortunately, we're maintaining compatibility with 3.5, so we
            # have to do all this bollocks instead:

            def __init__(self, paths):
                self._paths = paths
                self._i = 0
                self._mm = None

                if os.name == 'nt':
                    self._buffer_path = None
                else:
                    self._buffer_path = NamedTemporaryFile(delete=False).name

            def __del__(self):
                if self._mm is not None:
                    self._mm.close()
                self._del_buffer()

            def _del_buffer(self):
                if self._buffer_path is not None:
                    try:
                        os.remove(self._buffer_path)
                    except Exception:
                        pass
                    self._buffer_path = None

            def __aiter__(self):
                return self

            async def __anext__(self):

                if os.name == 'nt':
                    self._del_buffer()
                    self._buffer_path = mktemp()

                if self._i >= len(self._paths):
                    raise StopAsyncIteration()

                path = self._paths[self._i]

                norm_path = instance._normalise_path(path)
                name = os.path.splitext(os.path.basename(path))[0]

                model = InstanceModel(instance)

                if self._mm is not None:
                    self._mm.close()

                self._mm = MemoryMap.create(self._buffer_path, 4 * 1024 * 1024)
                model.dataset = DataSet.create(self._mm)

                ioloop = asyncio.get_event_loop()

                def prog_cb(p):
                    ioloop.call_soon_threadsafe(
                        functools.partial(
                            coms.send, None, instance_id, request,
                            complete=False, progress=(1000 * (self._i + p) / n_files, 1000)))

                await ioloop.run_in_executor(None, formatio.read, model, norm_path, prog_cb, False)

                self._i += 1
                return (name, model)

        try:
            if self._perms.open.local is False:
                raise PermissionError()

            datasets = MultipleDataSets(paths)
            await self._data.import_from(datasets, n_files > 1)
            self._mod_tracker.clear()

            response = jcoms.OpenProgress()
            self._coms.send(response, self._instance_id, request)

        except PermissionError as e:
            log.exception(e)
            base = ''
            if e.filename is not None:
                base = os.path.basename(e.filename)
            message = 'Unable to import {}'.format(base)
            cause = str(e)
            if cause == '':
                cause = 'Access is denied. You may not have the appropriate permissions to access this resource.'
            self._coms.send_error(message, cause, self._instance_id, request)

        except OSError as e:
            log.exception(e)
            base = ''
            if e.filename is not None:
                base = os.path.basename(e.filename)
            message = 'Unable to import {}'.format(base)
            cause = e.strerror
            self._coms.send_error(message, cause, self._instance_id, request)

        except Exception as e:
            log.exception(e)
            message = 'Unable to perform import'
            cause = str(e)
            self._coms.send_error(message, cause, self._instance_id, request)

        finally:
            self._data.analyses.rerun()

    def _open_callback(self, task, progress):
        response = jcoms.ComsMessage()
        response.open.status = jcoms.Status.Value('IN_PROGRESS')
        response.open.progress = progress
        response.open.progress_task = task

        self._coms.send(response, self._instance_id)

    async def _on_analysis(self, request):

        if request.restartEngines:
            await self.session.restart_engines()
            for analysis in self._data.analyses:
                analysis.rerun()
            return

        elif request.perform == jcoms.AnalysisRequest.Perform.Value('DELETE') and request.analysisId == 0:  # request to delete all analyses
            # delete all analyses
            self._data.analyses.remove_all()

            header = self._data.analyses.create_annotation(0)
            header.results.index = 1
            header.results.title = 'Results'

            # find all output columns
            columns_to_delete = [ ]

            for column in self._data:
                if column.column_type == ColumnType.OUTPUT:
                    columns_to_delete.append(column.id)

            if columns_to_delete:
                self._data.delete_columns_by_id(columns_to_delete)

            # send responses
            self._coms.send(request, self._instance_id, request)
            self._coms.send(header.results, self._instance_id)

            if columns_to_delete:
                broadcast = jcoms.DataSetRR()
                for id in columns_to_delete:
                    column_pb = broadcast.schema.columns.add()
                    column_pb.id = id
                    column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')
                self._populate_schema_info(None, broadcast)
                self._coms.send(broadcast, self._instance_id)

            return

        analysis = None
        if request.analysisId != 0:
            analysis = self._data.analyses.get(request.analysisId)

        if analysis is not None:  # analysis already exists
            self._data.is_edited = True
            if request.perform == jcoms.AnalysisRequest.Perform.Value('DELETE'):
                analysis_to_delete = self._data.analyses[request.analysisId]
                if analysis_to_delete.name != 'empty':
                    # delete analyses
                    for child in analysis_to_delete.dependents:
                        del self._data.analyses[child.id]
                    del self._data.analyses[request.analysisId]

                    # delete all output columns
                    columns_to_delete = [ ]

                    for column in self._data:
                        if column.output_analysis_id == request.analysisId:
                            columns_to_delete.append(column.id)

                    if columns_to_delete:
                        self._data.delete_columns_by_id(columns_to_delete)

                    # send responses
                    self._coms.send(request, self._instance_id, request, True)

                    if columns_to_delete:
                        broadcast = jcoms.DataSetRR()
                        for id in columns_to_delete:
                            column_pb = broadcast.schema.columns.add()
                            column_pb.id = id
                            column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')
                        self._populate_schema_info(None, broadcast)
                        self._coms.send(broadcast, self._instance_id)

                else:
                    analysis_to_delete.reset_options(request.revision)
                    self._coms.send(analysis_to_delete.results, self._instance_id, request, True)
            else:
                analysis.set_options(request.options, request.changed, request.revision, request.enabled)
                self._coms.send(None, self._instance_id, request, True)
        else:  # create analysis
            try:
                duplicating = request.perform == jcoms.AnalysisRequest.Perform.Value('DUPLICATE')

                if duplicating:
                    names = list(request.options.names)
                    index = names.index('duplicate')
                    dupliceeId = request.options.options[index].i
                    duplicee = self._data.analyses.get(dupliceeId)

                if self._data.analyses.has_header_annotation() is False:
                    header = self._data.analyses.create_annotation(0)
                    header.results.index = 1
                    header.results.title = 'Results'
                    if request.name == 'empty':
                        self._coms.send(header.results, self._instance_id, request, complete=True)
                    else:
                        self._coms.send(header.results, self._instance_id, complete=True)

                    # increment the index of the request, so it's placed after the header
                    request.index += 1

                if request.name != 'empty':

                    if request.analysisId % 2 != 0:
                        raise Exception('Analyses created by the client must have an even id')

                    analysis = self._data.analyses.create(
                        request.analysisId,
                        request.name,
                        request.ns,
                        request.i18n,
                        request.options,
                        None if request.index == 0 else request.index - 1)

                    self._data.is_edited = True

                    if duplicating:
                        analysis.copy_from(duplicee)
                        analysis.results.index = request.index
                        self._coms.send(analysis.results, self._instance_id, request, True)
                    else:
                        response = jcoms.AnalysisResponse()
                        response.name = request.name
                        response.ns = request.ns
                        response.instanceId = self.id
                        response.analysisId = analysis.id
                        response.options.ParseFromString(analysis.options.as_bytes())
                        response.index = request.index
                        response.status = jcoms.AnalysisStatus.Value('ANALYSIS_NONE')
                        self._coms.send(response, self._instance_id, request, True)
                        analysis.run()
                    child_index = request.index + 1
                    for child in analysis.dependents:
                        child.results.index = child_index
                        child_index += 1
                        self._coms.send(child.results, self._instance_id, complete=True)

            except OSError as e:

                log.error('Could not create analysis: ' + str(e))

                response = jcoms.AnalysisResponse()
                response.instanceId = self.id
                response.analysisId = analysis.id
                response.status = jcoms.AnalysisStatus.Value('ANALYSIS_ERROR')
                response.error.message = 'Could not create analysis: ' + str(e)

                self._coms.send(response, self._instance_id, request, True)

    def _on_info(self, request):

        response = jcoms.InfoResponse()

        has_dataset = self._data.has_dataset
        response.hasDataSet = has_dataset

        if has_dataset:
            response.title = self._data.title
            response.path = self._virtualise_path(self._data.path)
            response.saveFormat = self._data.save_format
            response.edited = self._data.is_edited
            response.blank = self._data.is_blank
            response.changesCount = self._mod_tracker.count
            response.changesPosition = self._mod_tracker.position

            response.schema.rowCount = self._data.row_count
            response.schema.vRowCount = self._data.virtual_row_count
            response.schema.columnCount = self._data.column_count
            response.schema.vColumnCount = self._data.visible_column_count
            response.schema.tColumnCount = self._data.total_column_count
            response.schema.deletedRowCount = self._data.row_tracker.total_removed_row_count
            response.schema.addedRowCount = self._data.row_tracker.total_added_row_count
            response.schema.editedCellCount = self._data.total_edited_cell_count
            response.schema.rowCountExFiltered = self._data.row_count_ex_filtered
            response.schema.filtersVisible = self._data.filters_visible

            for column in self._data:
                column_schema = response.schema.columns.add()
                self._populate_column_schema(column, column_schema, False)

            for transform in self._data.transforms:
                transform_schema = response.schema.transforms.add()
                self._populate_transform_schema(transform, transform_schema)

            if self._data.row_tracker.is_edited:
                for range in self._data.row_tracker.removed_row_ranges:
                    row_range_pb = response.schema.removedRowRanges.add()
                    row_range_pb.index = range['index']
                    row_range_pb.count = range['count']

        for analysis in self._data.analyses:
            if analysis.has_results:
                analysis_pb = response.analyses.add()
                analysis_pb.CopyFrom(analysis.results)

        self._coms.send(response, self._instance_id, request)

    def _clone_cell_selections(self, from_msg, to_msg):
        del to_msg.data[:]

        to_msg.incData = from_msg.incData
        if from_msg.incData:
            for block in from_msg.data:
                n_block = to_msg.data.add()
                n_block.rowStart = block.rowStart
                n_block.columnStart = block.columnStart
                n_block.rowCount = block.rowCount
                n_block.columnCount = block.columnCount

    def _on_dataset(self, request):

        if self._data is None:
            return

        try:

            response = jcoms.DataSetRR()

            if request.op == jcoms.GetSet.Value('SET'):
                response.op = request.op
                self._clone_cell_selections(request, response)
                if request.noUndo is False:
                    self._mod_tracker.begin_event(request)
                self._on_dataset_set(request, response)
                if request.noUndo is False:
                    self._mod_tracker.end_event()
            elif request.op == jcoms.GetSet.Value('GET'):
                response.op = request.op
                self._clone_cell_selections(request, response)
                self._on_dataset_get(request, response)
            elif request.op == jcoms.GetSet.Value('UNDO'):
                undo_request = self._mod_tracker.begin_undo()
                response.op = undo_request.op
                self._clone_cell_selections(undo_request, response)
                self._on_dataset_set(undo_request, response)
                self._mod_tracker.end_undo(response)
            elif request.op == jcoms.GetSet.Value('REDO'):
                redo_request = self._mod_tracker.get_redo()
                response.op = redo_request.op
                self._clone_cell_selections(redo_request, response)
                self._on_dataset_set(redo_request, response)
            else:
                raise ValueError()

            response.changesCount = self._mod_tracker.count
            response.changesPosition = self._mod_tracker.position

            self._coms.send(response, self._instance_id, request)

        except ForbiddenOp as e:
            message = 'Could not {}'.format(e.operation)
            self._coms.send_error(message, str(e), self._instance_id, request)
        except TypeError as e:
            self._coms.send_error('Could not assign data', str(e), self._instance_id, request)
        except Exception as e:
            log.exception(e)
            self._coms.send_error('Could not perform operation', str(e), self._instance_id, request)

    async def _on_module(self, request):

        modules = Modules.instance()

        try:
            if request.command == jcoms.ModuleRR.ModuleCommand.Value('INSTALL'):
                if self._perms.library.addRemove is False:
                    raise PermissionError()

                try:
                    stream = modules.install(request.path)
                    async for progress in stream:
                        self._coms.send(None, self._instance_id, request, complete=False, progress=progress)

                    self._coms.send(None, self._instance_id, request)
                    self._session.notify_global_changes()
                except Exception as e:
                    log.exception(e)
                    self._coms.send_error('Unable to install module', str(e), self._instance_id, request)

            elif request.command == jcoms.ModuleRR.ModuleCommand.Value('UNINSTALL'):
                if self._perms.library.addRemove is False:
                    raise PermissionError()
                try:
                    await modules.uninstall(request.name)
                    self._coms.send(None, self._instance_id, request)
                    self._session.notify_global_changes()
                except Exception as e:
                    log.exception(e)
                    self._coms.send_error(str(e), None, self._instance_id, request)
            elif request.command == jcoms.ModuleRR.ModuleCommand.Value('SHOW'):
                if self._perms.library.showHide is False:
                    raise PermissionError()
                self._set_module_visibility(request.name, True)
                self._coms.send(None, self._instance_id, request)
                self._session.notify_global_changes()
            elif request.command == jcoms.ModuleRR.ModuleCommand.Value('HIDE'):
                if self._perms.library.showHide is False:
                    raise PermissionError()
                self._set_module_visibility(request.name, False)
                self._coms.send(None, self._instance_id, request)
                self._session.notify_global_changes()

        except PermissionError as e:
            self._coms.send_error('Unable to perform request', str(e), self._instance_id, request)

    def _set_module_visibility(self, name, value):
        modules = Modules.instance()
        if modules.set_visibility(name, value):
            settings = Settings.retrieve('modules')
            hidden_mods = settings.get('hidden', [ ])
            if value:
                hidden_mods = [ mod for mod in hidden_mods if mod != name ]
            else:
                hidden_mods.append(name)
            settings.set('hidden', hidden_mods)
            settings.sync()

    async def _on_store(self, request):
        if self._perms.library.browseable is False:
            self._coms.send_error('Unable to access library', 'The library is disabled', self._instance_id, request)
        else:
            modules = Modules.instance()
            stream = modules.read_library()

            try:
                async for result in stream:
                    self._coms.send(None, self._instance_id, request, complete=False, progress=result)

                result = stream.result()
                response = jcoms.StoreResponse()
                if result.message is not None:
                    response.message = result.message
                for module in result.modules:
                    module_pb = response.modules.add()
                    self._module_to_pb(module, module_pb)
                self._coms.send(response, self._instance_id, request)
            except Exception as e:
                self._coms.send_error('Unable to access library', str(e), self._instance_id, request)

    def _on_dataset_set_checks(self, request):

        n_columns = self._data.column_count
        n_rows = self._data.row_count

        for column_pb in request.schema.columns:
            if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('INSERT'):
                n_columns += 1

        for row_pb in request.rows:
            if row_pb.action == jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT'):
                n_rows += row_pb.rowCount

        # also check when the user enters values outside the data set
        for block_pb in request.data:
            n_columns = max(n_columns, block_pb.columnStart + block_pb.columnCount)
            n_rows = max(n_rows, block_pb.rowStart + block_pb.rowCount)

        if n_columns > self._perms.dataset.maxColumns:
            raise ForbiddenOp(
                'insert columns',
                'This session is limited to {} columns'.format(
                    self._perms.dataset.maxColumns))

        if n_rows > self._perms.dataset.maxRows:
            raise ForbiddenOp(
                'insert rows',
                'This session is limited to {} rows'.format(
                    self._perms.dataset.maxRows))

    def _on_dataset_set(self, request, response):

        # we have to perform checks before we start making changes, as
        # we don't want to abort part way through, leaving things in an
        # indeterminate state
        self._on_dataset_set_checks(request)

        changes = {
            'columns': set(),
            'data_changed': set(),
            'transforms': set(),
            'deleted_columns': set(),
            'deleted_transforms': set(),
            'filters_changed': False,
        }

        self._on_dataset_del_cols(request, response, changes)
        self._on_dataset_del_rows(request, response, changes)
        self._on_dataset_ins_cols(request, response, changes)
        self._on_dataset_ins_rows(request, response, changes)
        self._on_dataset_mod_cols(request, response, changes)
        if request.incData:
            self._apply_cells(request, response, changes)

        if changes['filters_changed']:
            response.filtersChanged = True
            self._data.refresh_filter_state()

        self._populate_schema_info(request, response)
        # constuct response column schemas
        if len(changes['columns']) > 0 or len(changes['transforms']) > 0 or len(changes['deleted_columns']) > 0 or len(changes['deleted_transforms']) > 0:
            changes['columns'] = changes['columns'].difference(changes['deleted_columns'])
            changes['transforms'] = changes['transforms'].difference(changes['deleted_transforms'])
            changes['columns'] = sorted(changes['columns'], key=lambda x: x.index)
            for column in changes['deleted_columns']:
                column_pb = response.schema.columns.add()
                column_pb.id = column.id
                column_pb.action = jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE')
            for transform in changes['deleted_transforms']:
                transform_pb = response.schema.transforms.add()
                transform_pb.id = transform.id
                transform_pb.action = jcoms.DataSetSchema.TransformSchema.Action.Value('REMOVE')
            for column in changes['columns']:
                column_schema = response.schema.columns.add()
                data_changed = column in changes['data_changed']
                self._populate_column_schema(column, column_schema, data_changed)
            for transform in changes['transforms']:
                transform_schema = response.schema.transforms.add()
                self._populate_transform_schema(transform, transform_schema)

    def _on_dataset_get(self, request, response):
        if request.incSchema:
            self._populate_schema(request, response)
        if request.incData:
            self._populate_cells(request, response)

    def _on_dataset_ins_rows(self, request, response, changes):

        insertions = []
        for row_data in request.rows:
            if row_data.action == jcoms.DataSetRR.RowData.RowDataAction.Value('INSERT'):
                insertions.append(row_data)

        if insertions:
            if self._data.ex_filtered and self._data.has_filters:
                raise ForbiddenOp(
                    'insert rows',
                    'You cannot insert rows while filtered rows are hidden')

        insert_offsets = [0] * len(insertions)
        for i in range(0, len(insertions)):
            row_data = insertions[i]
            self._data.insert_rows(row_data.rowStart + insert_offsets[i], row_data.rowCount)
            for j in range(0, len(insertions)):
                if j != i and (insertions[j].rowStart + insert_offsets[j]) >= (row_data.rowStart + insert_offsets[i]):
                    insert_offsets[j] += row_data.rowCount

        for i in range(0, len(insertions)):
            row_data = insertions[i]
            row_data_pb = response.rows.add()
            row_data_pb.rowStart = row_data.rowStart + insert_offsets[i]
            row_data_pb.rowCount = row_data.rowCount
            row_data_pb.action = row_data.action
            self._mod_tracker.log_row_insertion(row_data_pb)

        if len(insertions) > 0:
            # this is done so that the cell changes are sent back
            for column in self._data:
                changes['columns'].add(column)

    def _on_dataset_ins_cols(self, request, response, changes):

        filter_inserted = False
        to_calc = set()

        request_schema_columns = []
        for column_pb in request.schema.columns:
            if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('INSERT'):
                request_schema_columns.append(column_pb)

        insert_offsets = [0] * len(request_schema_columns)
        for i in range(0, len(request_schema_columns)):
            column_pb = request_schema_columns[i]

            has_name = column_pb.name != ''
            self._data.insert_column(column_pb.index + insert_offsets[i], None, None, column_pb.id)

            column = self._data[column_pb.index + insert_offsets[i]]
            self._mod_tracker.log_column_insertion(column, column_pb)

            for j in range(0, len(request_schema_columns)):
                if j != i and (request_schema_columns[j].index + insert_offsets[j]) >= (column_pb.index + insert_offsets[i]):
                    insert_offsets[j] += 1

            column.column_type = ColumnType(column_pb.columnType)

            if column.column_type is ColumnType.FILTER:
                column.width = 78

            column.change(
                data_type=DataType(column_pb.dataType),
                measure_type=MeasureType(column_pb.measureType))

            column.formula = column_pb.formula
            column.auto_measure = column_pb.autoMeasure
            column.hidden = column_pb.hidden
            column.active = column_pb.active
            column.filter_no = column_pb.filterNo
            column.trim_levels = column_pb.trimLevels
            column.transform = column_pb.transform
            column.parent_id = column_pb.parentId
            column.set_missing_values(list(column_pb.missingValues))

            name = column_pb.name
            if has_name is False and column.column_type == ColumnType.RECODED:
                name = 'T' + str(self._data.get_column_count_by_type(ColumnType.RECODED))
                self._data.set_column_name(column, name)
                name = self._calc_column_name(column, '', '')

            if name != '':
                self._data.set_column_name(column, name)

            if column.column_type is ColumnType.FILTER:
                filter_inserted = True
                to_calc.add(column)

            if column.column_type is ColumnType.COMPUTED or column.column_type is ColumnType.RECODED:
                to_calc.add(column)

        if filter_inserted:
            self._data.update_filter_names()

        # see if we can clear errors in other transforms
        # as a result of the new column(s)
        for trans in self._data.transforms:
            if trans.in_error:  # broken
                trans.parse_formula()
                if not trans.in_error:  # fixed
                    to_calc.update(trans.dependents)
                    changes['transforms'].add(trans)

        # see if we can clear errors in other columns
        for column in self._data:
            message = column.formula_message
            if message != '':
                column.set_needs_parse()
                column.parse_formula()
                if column.formula_message != message:
                    changes['columns'].add(column)

        for column in to_calc:
            column.set_needs_parse()
        for column in to_calc:
            column.parse_formula()
        for column in to_calc:
            column.set_needs_recalc()
        for column in to_calc:
            column.recalc()

        if filter_inserted:
            # we could do this, but a newly inserted filter is all 'true'
            # self._data.refresh_filter_state()
            # so i don't think we need to
            pass

        # has to be after the filter names are renamed
        for i in range(0, len(request_schema_columns)):
            col_pb = request_schema_columns[i]
            column = self._data[col_pb.index + insert_offsets[i]]
            changes['columns'].add(column)

        if filter_inserted:
            for column in self._data:  # the filters info needs sending back because the names may have changed.
                if column.column_type is ColumnType.FILTER:
                    changes['columns'].add(column)

    def _on_dataset_del_rows(self, request, response, changes):
        rows_removed = False
        sorted_data = sorted(request.rows, key=lambda row_data: row_data.rowStart + row_data.rowCount - 1, reverse=True)

        for row_data in sorted_data:

            if self._data.ex_filtered and self._data.has_filters:
                raise ForbiddenOp(
                    'delete rows',
                    'You cannot delete rows while filtered rows are hidden')

            if row_data.action == jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE'):
                self._mod_tracker.log_row_deletion(row_data)
                row_start = row_data.rowStart
                row_end = row_data.rowStart + row_data.rowCount - 1
                if row_start >= self._data.row_count:
                    continue
                elif row_end >= self._data.row_count:
                    row_end = self._data.row_count - 1

                row_data_pb = response.rows.add()
                row_data_pb.rowStart = row_start
                row_data_pb.rowCount = row_end - row_start + 1
                row_data_pb.action = jcoms.DataSetRR.RowData.RowDataAction.Value('REMOVE')

                self._data.delete_rows(row_start, row_end)
                rows_removed = True

        if rows_removed:
            for column in self._data:  # the column info needs sending back because the cell edit ranges have changed
                changes['columns'].add(column)

    def _on_dataset_del_cols(self, request, response, changes):

        request_schema_columns = []
        for column in request.schema.columns:
            if column.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('REMOVE'):
                request_schema_columns.append(column)
        request_schema_columns = sorted(request_schema_columns, key=lambda x: x.index, reverse=True)

        to_delete = [None] * (len(request_schema_columns))
        deleted_column_ids = [None] * (len(request_schema_columns))
        to_reparse = set()
        tf_reparse = set()

        filter_deleted = False

        for i in range(len(to_delete)):
            column = None
            if request_schema_columns[i].id == 0:
                column = self._data[request_schema_columns[i].index]
            else:
                column = self._data.get_column_by_id(request_schema_columns[i].id)

            self._mod_tracker.log_column_deletion(column)

            dependents = column.dependents
            to_reparse.update(dependents)

            column.prep_for_deletion()
            to_delete[i] = column
            deleted_column_ids[i] = column.id
            if column.column_type is ColumnType.FILTER:
                filter_deleted = True

            for child in self._data:
                if child.parent_id == column.id:
                    parent_name = ''
                    if child.parent_id > 0:
                        parent = self._data.get_column_by_id(child.parent_id)
                        parent_name = parent.name
                    transform_name = ''
                    if child.transform > 0:
                        transform = self._data.get_transform_by_id(child.transform)
                        transform_name = transform.get_suffix()
                    child.parent_id = 0
                    to_reparse.add(child)
                    new_column_name = self._calc_column_name(child, parent_name, transform_name)
                    self._apply_column_name(child, new_column_name, None, to_reparse)

            for transform in self._data.transforms:
                if column in transform.dependencies:
                    tf_reparse.add(transform)
                    to_reparse.update(transform.dependents)

        to_reparse -= set(to_delete)

        self._data.delete_columns_by_id(deleted_column_ids)

        for transform in tf_reparse:
            transform.parse_formula()

        for column in to_reparse:
            column.set_needs_parse()
        for column in to_reparse:
            column.parse_formula()

        if filter_deleted:
            to_recalc = self._data  # all
        else:
            to_recalc = to_reparse

        for column in to_recalc:
            column.set_needs_recalc()
        for column in to_recalc:
            column.recalc()

        for column in to_delete:
            changes['deleted_columns'].add(column)

        if filter_deleted:
            # filter names could have changed
            for column in self._data:
                if column.is_filter:
                    changes['columns'].add(column)
            changes['filters_changed'] = True
        else:
            for column in sorted(to_reparse, key=lambda x: x.index):
                changes['columns'].add(column)

        for transform in tf_reparse:
            changes['transforms'].add(transform)

    def _calc_column_name(self, column, old_parent_name, old_transform_name):

        pass_test = False

        is_none = old_parent_name == '' and old_transform_name == ''

        current_column_name = column.name
        match = re.match(r'(^.+)(?=( \(\d+\))$)|(^.+)', current_column_name)
        if match:
            current_column_name = match.group(0)

        if is_none:
            match = re.match(r'^T(\d+$)', current_column_name)
            if match:
                pass_test = True
        else:
            test_name = ''
            if '...' not in old_transform_name:
                joiner = ''
                if old_transform_name.startswith('_') is False and old_transform_name.startswith('-') is False:
                    joiner = ' - '
                if old_transform_name == '':
                    test_name = old_parent_name
                elif old_parent_name == '':
                    test_name = '?' + joiner + old_transform_name
                else:
                    test_name = old_parent_name + joiner + old_transform_name
            else:
                insert = old_parent_name
                if insert == '':
                    insert = '?'
                test_name = old_transform_name.replace('...', insert, 1)
            pass_test = current_column_name == test_name.strip()

        if pass_test:
            transform_name = ''
            if column.transform > 0:
                transform = self._data.get_transform_by_id(column.transform)
                transform_name = transform.get_suffix()

            parent_name = ''
            if column.parent_id > 0:
                parent = self._data.get_column_by_id(column.parent_id)
                parent_name = parent.name

            new_name = ''
            if column.transform == 0 and column.parent_id == 0:
                new_name = 'T' + str(self._data.get_column_count_by_type(ColumnType.RECODED))
            elif '...' not in transform_name:
                joiner = ''
                if transform_name.startswith('_') is False and transform_name.startswith('-') is False:
                    joiner = ' - '
                if column.transform == 0:
                    new_name = parent_name
                elif column.parent_id == 0:
                    new_name = '?' + joiner + transform_name
                else:
                    new_name = parent_name + joiner + transform_name
            else:
                insert = parent_name
                if insert == '':
                    insert = '?'
                new_name = transform_name.replace('...', insert, 1)
            return new_name.strip()

        return column.name

    def _apply_column_name(self, column, new_column_name, cols_changed, reparse):
        if new_column_name != column.name:
            is_circular = self._data.has_circular_parenthood(column)

            old_name = column.name
            self._data.set_column_name(column, new_column_name)

            if cols_changed is not None:
                cols_changed.add(column)
            reparse.update(column.dependents)

            if is_circular is False:
                for check_column in self._data:
                    if check_column.parent_id == column.id:
                        transform_name = ''
                        if check_column.transform > 0:
                            transform = self._data.get_transform_by_id(check_column.transform)
                            transform_name = transform.get_suffix()
                        next_column_name = self._calc_column_name(check_column, old_name, transform_name)
                        self._apply_column_name(check_column, next_column_name, cols_changed, reparse)

    def _on_dataset_mod_cols(self, request, response, changes):

        if self._data.ex_filtered and self._data.has_filters:
            # some operations are forbidden when filtered rows are hidden/excluded
            for trans_pb in request.schema.transforms:
                if (trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('UPDATE')
                        or trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('REMOVE')):
                    transform = self._data.get_transform_by_id(trans_pb.id)
                    if any(dep.is_filter for dep in transform.dependents):
                        raise ForbiddenOp(
                            'modify transform',
                            'You cannot modify transforms that affect filters when filtered rows are hidden')

            for column_pb in request.schema.columns:
                if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('MODIFY'):
                    if column_pb.id != 0:
                        column = self._data.get_column_by_id(column_pb.id)
                        if not column.is_filter and any(dep.is_filter for dep in column.dependents):
                            raise ForbiddenOp(
                                'modify columns',
                                'You cannot modify columns that affect filters when filtered rows are hidden')

        # columns that need to be reparsed, and/or recalced
        reparse = set()
        recalc = set()

        # the changes to be sent back to the client in the response
        cols_changed = set()
        trans_changed = set()

        for trans_pb in request.schema.transforms:

            trans_id = trans_pb.id
            trans_name = trans_pb.name
            trans_colour_index = trans_pb.colourIndex

            if trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('CREATE'):
                transform = self._data.append_transform(trans_name, trans_id, trans_colour_index)

                transform.formula = list(trans_pb.formula)
                transform.description = trans_pb.description
                transform.suffix = trans_pb.suffix
                transform.measure_type = MeasureType(trans_pb.measureType)

                trans_changed.add(transform)

            elif trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('UPDATE'):
                transform = self._data.get_transform_by_id(trans_id)
                old_transform_name = transform.get_suffix()
                transform_name_changed = self._data.set_transform_name(transform, trans_name)
                self._data.set_transform_colour_index(transform, trans_colour_index)

                transform_name_changed = transform_name_changed or transform.suffix != trans_pb.suffix
                transform.suffix = trans_pb.suffix

                new_formula = list(trans_pb.formula)
                new_m_type = MeasureType(trans_pb.measureType)
                if transform.formula != new_formula or transform.measure_type != new_m_type:
                    transform.formula = new_formula
                    transform.measure_type = new_m_type
                    transform.parse_formula()
                    for column in self._data:
                        if column.transform == trans_id:
                            reparse.add(column)
                elif transform_name_changed:
                    for column in self._data:
                        if column.transform == trans_id:
                            parent_name = ''
                            if column.parent_id > 0:
                                parent = self._data.get_column_by_id(column.parent_id)
                                parent_name = parent.name
                            new_column_name = self._calc_column_name(column, parent_name, old_transform_name)
                            self._apply_column_name(column, new_column_name, cols_changed, reparse)

                transform.description = trans_pb.description
                transform.colour_index = trans_pb.colourIndex
                trans_changed.add(transform)
            else:
                pass  # deletion handled further down

        virtualise_column = None
        request_schema_columns = []

        if request.incSchema and request.schema.filtersVisible != self._data.filters_visible:
            self._mod_tracker.log_filters_visible_change(self._data.filters_visible)
            self._data.filters_visible = request.schema.filtersVisible
            for column in self._data:
                if column.is_filter is False:
                    break
                column.hidden = self._data.filters_visible is False
                cols_changed.add(column)

        for column_pb in request.schema.columns:
            if column_pb.action == jcoms.DataSetSchema.ColumnSchema.Action.Value('MODIFY'):
                column = None
                if column_pb.id != 0:
                    column = self._data.get_column_by_id(column_pb.id)
                else:
                    column = self[column_pb.index]

                self._mod_tracker.log_column_modification(column, column_pb)
                if ColumnType(column_pb.columnType) == ColumnType.NONE:
                    if virtualise_column is None or column.index < virtualise_column.index:
                        virtualise_column = column
                    cols_changed.add(column)
                else:
                    request_schema_columns.append(column_pb)

        if virtualise_column is not None:
            deleted_columns = self._data._virtualise_column(virtualise_column)  # this will virtualise everything to the right of this column
            changes['deleted_columns'].update(deleted_columns)

        if len(request_schema_columns) > 0:

            min_index = self._data.total_column_count
            for column_schema in request_schema_columns:
                column = None
                if column_schema.id == 0:
                    column = self._data[column_schema.index]
                else:
                    column = self._data.get_column_by_id(column_schema.id)

                if column.index < min_index:
                    min_index = column.index

            n_cols_before = self._data.total_column_count

            # 'realise' any virtual columns to the left of the edit
            for i in range(self._data.column_count, min_index):
                column = self._data[i]
                column.realise()
                self._mod_tracker.log_column_realisation(column)
                cols_changed.add(column)

            for column_pb in request_schema_columns:
                column = None
                if column_pb.id == 0:
                    column = self._data[column_pb.index]
                else:
                    column = self._data.get_column_by_id(column_pb.id)
                old_name = column.name
                old_type = column.column_type
                old_d_type = column.data_type
                old_m_type = column.measure_type
                old_formula = column.formula
                old_active = column.active
                old_type = column.column_type
                old_filter_no = column.filter_no
                old_levels = column.levels
                old_trim = column.trim_levels
                old_transform = column.transform
                old_parent_id = column.parent_id
                old_missing_values = column.missing_values

                levels = None
                if column_pb.hasLevels:
                    levels = [ ]
                    for level in column_pb.levels:
                        levels.append((
                            level.value,
                            level.label,
                            level.importValue,
                            level.pinned))

                if column.column_type is ColumnType.NONE:
                    column.column_type = ColumnType(column_pb.columnType)

                if column.column_type is ColumnType.DATA:
                    column.change(
                        data_type=DataType(column_pb.dataType),
                        measure_type=MeasureType(column_pb.measureType),
                        levels=levels)

                column.set_missing_values(list(column_pb.missingValues))
                column.column_type = ColumnType(column_pb.columnType)

                column.formula = column_pb.formula
                column.auto_measure = column_pb.autoMeasure
                column.hidden = column_pb.hidden
                column.active = column_pb.active
                column.filter_no = column_pb.filterNo
                column.trim_levels = column_pb.trimLevels
                column.description = column_pb.description
                column.transform = column_pb.transform
                column.parent_id = column_pb.parentId
                column.width = column_pb.width

                if old_type == ColumnType.NONE and column.column_type == ColumnType.RECODED:
                    new_column_name = 'T' + str(self._data.get_column_count_by_type(ColumnType.RECODED))
                    self._apply_column_name(column, new_column_name, cols_changed, reparse)
                elif column_pb.name != '':
                    new_column_name = column_pb.name
                    if column_pb.transform != old_transform or column_pb.parentId != old_parent_id:
                        transform_name = ''
                        if old_transform > 0:
                            transform = self._data.get_transform_by_id(old_transform)
                            transform_name = transform.get_suffix()
                        parent_name = ''
                        if old_parent_id > 0:
                            parent = self._data.get_column_by_id(old_parent_id)
                            parent_name = parent.name

                        new_column_name = self._calc_column_name(column, parent_name, transform_name)
                    self._apply_column_name(column, new_column_name, cols_changed, reparse)

                cols_changed.add(column)

                # if these things haven't changed, no need
                # to trigger recalcs
                if (column.name == old_name
                        and column.column_type == old_type
                        and column.data_type == old_d_type
                        and column.measure_type == old_m_type
                        and column.formula == old_formula
                        and column.filter_no == old_filter_no
                        and column.levels == old_levels
                        and column.active == old_active
                        and column.trim_levels == old_trim
                        and column.transform == old_transform
                        and column.parent_id == old_parent_id
                        and column.missing_values == old_missing_values):
                    continue

                recalc.add(column)

                if column.formula != old_formula:
                    reparse.add(column)
                elif column.transform != old_transform:
                    reparse.add(column)
                elif column.parent_id != old_parent_id:
                    reparse.add(column)
                elif column.active != old_active:
                    # this is only relevant for filters
                    reparse.add(column)
                    for filter in self._data:
                        if not filter.is_filter:
                            break
                        # reparse subsequent filters
                        if filter.filter_no > column.filter_no:
                            reparse.add(filter)
                elif old_name != column.name:          # if a name has changed, then
                    reparse.update(column.dependents)  # dep columns need to be reparsed
                elif old_d_type != column.data_type:
                    reparse.update(column.dependents)
                elif old_m_type != column.measure_type:
                    reparse.update(column.dependents)

            for i in range(n_cols_before, self._data.total_column_count):  # cols added
                column = self._data[i]
                cols_changed.add(column)

        # handle transform deletions
        for trans_pb in request.schema.transforms:
            if trans_pb.action == jcoms.DataSetSchema.TransformSchema.Action.Value('REMOVE'):
                self._mod_tracker.log_transform_deletion(self._data.get_transform_by_id(trans_pb.id))
                removed_transform = self._data.remove_transform(trans_pb.id)
                changes['deleted_transforms'].add(removed_transform)
                for column in self._data:
                    if column.transform == trans_pb.id:
                        column.transform = 0
                        reparse.add(column)
                        parent_name = ''
                        if column.parent_id > 0:
                            parent = self._data.get_column_by_id(column.parent_id)
                            parent_name = parent.name
                        new_column_name = self._calc_column_name(column, parent_name, removed_transform.get_suffix())
                        self._apply_column_name(column, new_column_name, cols_changed, reparse)

        # dependent columns need to be reparsed too
        dependents = set()
        for column in reparse:
            dependents.update(column.dependents)
        reparse.update(dependents)

        # see if we can clear errors in other transforms
        # maybe something has changed as a result of a column
        # being renamed
        for trans in self._data.transforms:
            if trans in trans_changed:  # skip ones already processed
                continue
            if trans.in_error:  # broken
                trans.parse_formula()
                if not trans.in_error:  # fixed
                    reparse.update(trans.dependents)
                    trans_changed.add(trans)

        # see if we can clear errors in other columns
        for column in self._data:
            if column.formula_message != '':
                reparse.add(column)

        for column in reparse:
            column.set_needs_parse()
        for column in reparse:
            column.parse_formula()

        recalc.update(reparse)

        dependents = set()
        for column in recalc:
            dependents.update(column.dependents)
        recalc.update(dependents)

        filter_changed = False
        for column in recalc:
            # if a filter has changed, recalc everything
            if column.is_filter:
                filter_changed = True
                recalc = self._data
                break

        for column in recalc:
            column.set_needs_recalc()
        for column in recalc:
            column.recalc()

        cols_changed.update(recalc)

        if len(cols_changed) > 0 or len(trans_changed) > 0:
            self._data.is_edited = True

        if filter_changed:
            changes['filters_changed'] = True

        for column in cols_changed:
            changes['columns'].add(column)
        for transform in trans_changed:
            changes['transforms'].add(transform)
        for column in recalc:
            changes['data_changed'].add(column)

    def _parse_cells(self, request):

        if request.incData:
            block_count = len(request.data)
            blocks = [None] * block_count
            bottom_most_row_index = -1
            right_most_column_index = -1
            size = 0

            for i in range(block_count):
                block_pb = request.data[i]
                block = { 'row_start': block_pb.rowStart, 'column_start': block_pb.columnStart }
                blocks[i] = block
                row_count = 0
                col_count = 0
                if block_pb.incCBData:
                    cells = None
                    if block_pb.cbHtml != '':
                        parser = HTMLParser()
                        parser.feed(block_pb.cbHtml)
                        parser.close()
                        cells = parser.result()
                        size += self._mod_tracker.get_size_of(block_pb.cbHtml)
                    else:
                        parser = CSVParser()
                        parser.feed(block_pb.cbText)
                        parser.close()
                        cells = parser.result()
                        size += self._mod_tracker.get_size_of(block_pb.cbText)

                    row_count = 0
                    if (len(cells) > 0):
                        row_count = len(cells[0])
                    col_count = len(cells)

                    if block_pb.rowCount % row_count  == 0 and block_pb.columnCount % col_count == 0:
                        row_count = block_pb.rowCount
                        col_count = block_pb.columnCount
                        new_cells = []
                        for cc in range(col_count):
                            new_rows = []
                            new_cells.append(new_rows)
                            for rr in range(row_count):
                                col_val = cells[cc % len(cells)]
                                new_rows.append(col_val[rr % len(col_val)])
                        cells = new_cells

                    block['row_count'] = row_count
                    block['column_count'] = col_count
                    block['values'] = cells
                    block['clear'] = False
                else:
                    row_count = block_pb.rowCount
                    col_count = block_pb.columnCount
                    cells = [None] * col_count
                    block['row_count'] = row_count
                    block['column_count'] = col_count
                    block['clear'] = block_pb.clear
                    block['values'] = cells
                    is_actually_clear = True
                    for c in range(col_count):
                        cells[c] = [None] * row_count
                        if block_pb.clear is False:
                            for r in range(row_count):
                                cell_pb = block_pb.values[(c * row_count) + r]
                                if cell_pb.HasField('o'):
                                    cells[c][r] = None
                                elif cell_pb.HasField('d'):
                                    cells[c][r] = cell_pb.d
                                    is_actually_clear = False
                                elif cell_pb.HasField('i'):
                                    cells[c][r] = cell_pb.i
                                    is_actually_clear = False
                                elif cell_pb.HasField('s'):
                                    cells[c][r] = cell_pb.s
                                    is_actually_clear = False
                            size += self._mod_tracker.get_size_of(cells[c][r])
                    if is_actually_clear != block['clear']:
                        block['clear'] = is_actually_clear

                if block_pb.clear is False:
                    if right_most_column_index < block_pb.columnStart + col_count - 1:
                        right_most_column_index = block_pb.columnStart + col_count - 1
                    if bottom_most_row_index < block_pb.rowStart + row_count - 1:
                        bottom_most_row_index = block_pb.rowStart + row_count - 1
                else:
                    size = 0
                    bottom_most_row_index = -1
                    right_most_column_index = -1

            self._mod_tracker.log_space_used(size)

            return blocks, bottom_most_row_index, right_most_column_index
        else:
            return [ ], -1, -1

    def _get_column(self, index, base=0, is_display_index=False):
        data = { 'column': None, index: -1 }
        if is_display_index is True:
            count = 0
            i = 0
            while True:
                next_index = base + count + i
                if next_index >= self._data.total_column_count:
                    break
                column = self._data[next_index]
                if column.hidden is False:
                    data['column'] = column
                    data['index'] = count
                    if count == index:
                        break
                    count += 1
                else:
                    i += 1
        else:
            next_index = base + index
            if next_index < self._data.total_column_count:
                data['column'] = self._data[next_index]
                data['index'] = next_index

        return data

    def _apply_cells(self, request, response, changes):

        data, bottom_most_row_index, right_most_column_index = self._parse_cells(request)

        if len(data) == 0:
            return

        if self._data.ex_filtered and self._data.has_filters:
            # Some operations are forbidden when filtered rows are hidden/excluded
            for block in data:
                column_start = block['column_start']
                column_count = block['column_count']
                column_end = column_start + column_count

                for column in islice(self._data.columns_ex_hidden, column_start, column_end):
                    if any(dep.is_filter for dep in column.dependents):
                        raise ForbiddenOp(
                            'modify columns',
                            'You cannot modify columns that affect filters when filtered rows are hidden')

        data_list = []

        del response.data[:]
        response.incData = True
        for block in data:
            n_block = response.data.add()
            n_block.rowStart = block['row_start']
            n_block.columnStart = block['column_start']
            n_block.rowCount = block['row_count']
            n_block.columnCount = block['column_count']
            n_block.clear = block['clear']
            self._mod_tracker.log_data_write(n_block)

        cols_changed = set()  # schema changes to send
        reparse = set()
        recalc = set()  # computed columns that need to update from these changes

        n_cols_before = self._data.total_column_count
        n_rows_before = self._data.row_count
        expected_n_rows = self._data.row_count

        if bottom_most_row_index >= self._data.row_count:
            expected_n_rows = bottom_most_row_index + 1

        if right_most_column_index != -1:
            right_most_column_data = self._get_column(right_most_column_index, 0, True)
            right_most_index = right_most_column_data['column'].index + (right_most_column_index - right_most_column_data['index'])  # right_most_column_index is a display index and _get_column will return the last column that
            for i in range(self._data.column_count, right_most_index + 1):
                column = self._data[i]
                if column.is_virtual:
                    column.realise()
                    cols_changed.add(column)
                    self._mod_tracker.log_column_realisation(column)

        for block in data:
            col_start = block['column_start']
            row_start = block['row_start']
            row_count = block['row_count']
            col_count = block['column_count']

            if row_count == 0 or col_count == 0:
                continue

            if row_start >= expected_n_rows:
                continue

            if row_start + row_count - 1 >= expected_n_rows:
                row_count = expected_n_rows - row_start

            base_index = 0
            search_index = col_start
            data_col_count = 0
            for i in range(col_count):

                column_data = self._get_column(search_index, base_index, True)
                column = column_data['column']

                if column is None:
                    break

                base_index = column.index + 1
                search_index = 0

                if column.is_virtual is False and column.column_type not in { ColumnType.COMPUTED, ColumnType.RECODED, ColumnType.FILTER }:
                    data_list.append({ 'column': column, 'row_start': row_start, 'row_count': row_count, 'values': block['values'][i] })

                if column.column_type == ColumnType.DATA or column.column_type == ColumnType.NONE:
                    data_col_count += 1

                if col_count == 1:
                    if column.column_type == ColumnType.COMPUTED:
                        raise TypeError("Cannot assign to computed column '{}'".format(column.name))
                    elif column.column_type == ColumnType.RECODED:
                        raise TypeError("Cannot assign to recoded column '{}'".format(column.name))
                    elif column.column_type == ColumnType.FILTER:
                        raise TypeError("Cannot assign to filter column '{}'".format(column.name))

                if column.auto_measure:
                    continue  # skip checks

                values = block['values'][i]

                if column.data_type == DataType.DECIMAL:
                    for value in values:
                        if value is not None and value != '' and not isinstance(value, int) and not isinstance(value, float):
                            raise TypeError("Cannot assign non-numeric value to column '{}'".format(column.name))

                elif column.data_type == DataType.INTEGER:
                    for value in values:
                        if isinstance(value, int) and not is_int32(value):
                            raise TypeError("Value is too large for column '{}' of type integer".format(column.name))

            if col_count > 0 and data_col_count == 0:
                raise TypeError("Cannot assign to these columns.")

        if bottom_most_row_index >= self._data.row_count:
            self._mod_tracker.log_rows_appended(self._data.row_count, bottom_most_row_index)
            self._data.set_row_count(bottom_most_row_index + 1)

        filter_changed = False

        for data_item in data_list:
            column = data_item['column']
            row_start = data_item['row_start']
            row_count = data_item['row_count']
            values = data_item['values']

            if self._data.ex_filtered and self._data.has_filters:
                indices_map = self._data.get_indices_ex_filtered(row_start, row_count)
            else:
                indices_map = list(range(row_start, row_start + row_count))

            column.column_type = ColumnType.DATA
            column.set_needs_recalc()  # invalidate dependent nodes

            was_virtual = column.is_virtual
            column_changes = column.changes

            if column.auto_measure:  # change data type if necessary

                dt = column.data_type
                mt = column.measure_type

                for j in range(row_count):
                    value = values[j]
                    if value is None or value == '':
                        pass
                    elif isinstance(value, int):
                        if dt is not DataType.TEXT and not is_int32(value):
                            dt = DataType.DECIMAL
                            mt = MeasureType.CONTINUOUS
                    elif isinstance(value, float):
                        if dt is not DataType.TEXT:
                            dt = DataType.DECIMAL
                            mt = MeasureType.CONTINUOUS
                    elif isinstance(value, str):
                        dt = DataType.TEXT
                        if mt is MeasureType.CONTINUOUS:
                            mt = MeasureType.NOMINAL

                if dt != column.data_type:
                    column.change(data_type=dt, measure_type=mt)

            if column.data_type == DataType.DECIMAL:
                nan = float('nan')
                for j in range(row_count):
                    value = values[j]
                    row_no = indices_map[j]

                    if value is None or value == '':
                        column.set_value(row_no, nan)
                    elif isinstance(value, float):
                        column.set_value(row_no, value)
                    elif isinstance(value, int):
                        column.set_value(row_no, float(value))
                    else:
                        raise TypeError("Cannot assign non-numeric value to column '{}'", column.name)

            elif column.data_type == DataType.TEXT:
                for j in range(row_count):
                    value = values[j]
                    row_no = indices_map[j]

                    if value is None or value == '':
                        column.clear_at(row_no)
                        continue

                    if isinstance(value, float):
                        if math.isnan(value):
                            value = ''
                        else:
                            value = str(value)
                    else:
                        value = str(value)

                    if column.measure_type == MeasureType.ID:
                        column.set_value(row_no, value)
                    else:
                        column.clear_at(row_no)  # necessary to clear first with TEXT
                        if value == '':
                            index = -2147483648
                        elif not column.has_level(value):
                            index = column.level_count
                            column.insert_level(index, value)
                        else:
                            index = column.get_value_for_label(value)
                        column.set_value(row_no, index)

            else:  # elif column.data_type == DataType.INTEGER:
                for j in range(row_count):
                    value = values[j]
                    row_no = indices_map[j]

                    if value is None or value == '':
                        column.clear_at(row_no)
                    elif isinstance(value, int):
                        if column.measure_type != MeasureType.ID:
                            if not column.has_level(value) and value != -2147483648:
                                column.insert_level(value, str(value))
                        column.set_value(row_no, value)
                    elif isinstance(value, str):
                        if column.measure_type == MeasureType.ID:
                            raise RuntimeError('Should not get here')
                        elif column.has_level(value):
                            index = column.get_value_for_label(value)
                        else:
                            column.clear_at(row_no)
                            index = 0
                            for level in column.levels:
                                index = max(index, level[0])
                            index += 1
                            column.insert_level(index, value, str(index))
                        column.set_value(row_no, index)
                    else:
                        raise RuntimeError('Should not get here')

            if self._data.ex_filtered and self._data.has_filters:
                for row_no in indices_map:
                    self._mod_tracker.set_cells_as_edited(column, row_no, row_no)
            else:
                self._mod_tracker.set_cells_as_edited(column, row_start, row_start + row_count - 1)

            cols_changed.add(column)

            if column.auto_measure:
                self._auto_adjust(column)
            elif column.data_type == DataType.DECIMAL:
                column.determine_dps()

            if column_changes != column.changes or was_virtual:
                # if a schema change
                cols_changed.add(column)
                # reparse dependents, as it may impact their data/measure type
                reparse.update(column.dependents)

            dependents = column.dependents
            recalc.update(dependents)
            cols_changed.update(dependents)

            for dep in dependents:
                if dep.is_filter:
                    filter_changed = True

        self._data.is_edited = True

        for i in range(n_cols_before, self._data.total_column_count):  # cols added
            column = self._data[i]
            cols_changed.add(column)

        n_rows_changed = (n_rows_before != self._data.row_count)

        if n_rows_changed:
            recalc = self._data  # if more rows recalc all
            cols_changed = self._data  # send *all* column schemas
        else:
            # sort ascending (the client doesn't like them out of order)
            cols_changed = sorted(cols_changed, key=lambda x: x.index)

        for column in reparse:
            column.set_needs_parse()
        for column in reparse:
            column.parse_formula()
        for column in recalc:
            column.set_needs_recalc()
        for column in recalc:
            column.recalc()

        if filter_changed or n_rows_changed:
            changes['filters_changed'] = True

        for column in cols_changed:
            changes['columns'].add(column)
            changes['data_changed'].add(column)

        self._populate_cells(request, response)

    def _auto_adjust(self, column):

        if column.data_type == DataType.TEXT:

            d_type = DataType.INTEGER
            m_type = MeasureType.NOMINAL

            try:
                for level in column.levels:
                    value = float(level[1])
                    if d_type is DataType.INTEGER:
                        if not math.isclose(value % 1, 0.0):
                            d_type = DataType.DECIMAL
                            m_type = MeasureType.CONTINUOUS
                        if not is_int32(value):
                            d_type = DataType.DECIMAL
                            m_type = MeasureType.CONTINUOUS

                column.change(data_type=d_type, measure_type=m_type)

            except ValueError:
                # don't change
                pass

        elif column.data_type == DataType.DECIMAL:
            for value in column:
                if math.isnan(value):
                    continue
                if not math.isclose(value % 1, 0.0):
                    # don't change
                    break
                if not is_int32(value):
                    # don't change
                    break
            else:
                column.change(
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.NOMINAL)
                return

            column.determine_dps()

    def _populate_cells(self, request, response):

        for block_pb in response.data:
            col_start = block_pb.columnStart
            row_start = block_pb.rowStart
            row_count = block_pb.rowCount
            col_count = block_pb.columnCount

            row_data = response.rows.add()
            row_data.rowStart = row_start
            row_data.rowCount = row_count
            row_data.action = jcoms.DataSetRR.RowData.RowDataAction.Value('MODIFY')

            row_nums = range(row_start, row_start + row_count)

            if not self._data.ex_filtered:
                filtered = map(lambda row_no: self._data.is_row_filtered(row_no), row_nums)
                filtered = map(lambda filtered: 1 if filtered else 0, filtered)
                row_data.filterData = bytes(filtered)
                indices_map = list(range(row_start, row_start + row_count))
            else:
                row_nums = map(lambda row_no: self._data.get_index_ex_filtered(row_no), row_nums)
                row_data.rowNums[:] = row_nums
                indices_map = self._data.get_indices_ex_filtered(row_start, row_count)

            base_index = 0
            search_index = col_start
            for cc in range(col_count):
                column_data = self._get_column(search_index, base_index, True)
                column = column_data['column']

                if column is None:
                    break

                base_index = column.index + 1
                search_index = 0

                if column.data_type == DataType.DECIMAL:
                    for j in range(row_count):
                        cell = block_pb.values.add()
                        row_no = indices_map[j]
                        if row_no >= self._data.row_count:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            v = column.get_value(row_no, True)
                            if math.isnan(v.value):
                                cell.o = jcoms.SpecialValues.Value('MISSING')
                            else:
                                cell.d = v.value
                            if v.missing:
                                cell.missing = True
                elif column.data_type == DataType.TEXT:
                    for j in range(row_count):
                        cell = block_pb.values.add()
                        row_no = indices_map[j]
                        if row_no >= self._data.row_count:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            v = column.get_value(row_no, True)
                            if v.value == '':
                                cell.o = jcoms.SpecialValues.Value('MISSING')
                            else:
                                cell.s = v.value
                            if v.missing:
                                cell.missing = True
                else:
                    for j in range(row_count):
                        cell = block_pb.values.add()
                        row_no = indices_map[j]
                        if row_no >= self._data.row_count:
                            cell.o = jcoms.SpecialValues.Value('MISSING')
                        else:
                            v = column.get_value(row_no, True)
                            if v.value == -2147483648:
                                cell.o = jcoms.SpecialValues.Value('MISSING')
                            else:
                                cell.i = v.value
                            if v.missing:
                                cell.missing = True

    def _populate_schema(self, request, response):
        self._populate_schema_info(request, response)
        for column in self._data:
            column_schema = response.schema.columns.add()
            self._populate_column_schema(column, column_schema, False)
        for transform in self._data.transforms:
            transform_schema = response.schema.transforms.add()
            self._populate_transform_schema(transform, transform_schema)

    def _populate_schema_info(self, request, response):
        response.incSchema = True
        response.schema.rowCount = self._data.row_count
        response.schema.vRowCount = self._data.virtual_row_count
        response.schema.columnCount = self._data.column_count
        response.schema.vColumnCount = self._data.visible_column_count
        response.schema.tColumnCount = self._data.total_column_count
        response.schema.deletedRowCount = self._data.row_tracker.total_removed_row_count
        response.schema.addedRowCount = self._data.row_tracker.total_added_row_count
        response.schema.editedCellCount = self._data.total_edited_cell_count
        response.schema.rowCountExFiltered = self._data.row_count_ex_filtered
        response.schema.filtersVisible = self._data.filters_visible

        if self._data.row_tracker.is_edited:
            for range in self._data.row_tracker.removed_row_ranges:
                row_range_pb = response.schema.removedRowRanges.add()
                row_range_pb.index = range['index']
                row_range_pb.count = range['count']

    def _populate_transform_schema(self, transform, transform_schema):
        transform_schema.name = transform.name
        transform_schema.id = transform.id
        transform_schema.formula[:] = transform.formula
        transform_schema.formulaMessage[:] = transform.formula_message
        transform_schema.description = transform.description
        transform_schema.suffix = transform.suffix
        transform_schema.measureType = transform.measure_type.value
        transform_schema.colourIndex = transform.colour_index

    def _populate_column_schema(self, column, column_schema, data_changed):
        column_schema.name = column.name
        column_schema.importName = column.import_name
        column_schema.id = column.id
        column_schema.index = column.index
        column_schema.dataChanged = data_changed

        column_schema.columnType = column.column_type.value
        column_schema.dataType = column.data_type.value
        column_schema.measureType = column.measure_type.value
        column_schema.autoMeasure = column.auto_measure
        column_schema.missingValues[:] = column.missing_values
        column_schema.width = column.width

        column_schema.dps = column.dps
        column_schema.formula = column.formula
        column_schema.formulaMessage = column.formula_message
        column_schema.description = column.description
        column_schema.hidden = column.hidden
        column_schema.active = column.active
        column_schema.filterNo = column.filter_no
        column_schema.trimLevels = column.trim_levels
        column_schema.transform = column.transform
        column_schema.parentId = column.parent_id
        column_schema.outputAnalysisId = column.output_analysis_id

        column_schema.hasLevels = True

        if column.has_levels:
            for level in column.levels:
                level_pb = column_schema.levels.add()
                level_pb.value = level[0]
                level_pb.label = level[1]
                level_pb.importValue = level[2]
                level_pb.pinned = level[3]

        if column.cell_tracker.is_edited:
            for range in column.cell_tracker.edited_cell_ranges:
                cell_range_pb = column_schema.editedCellRanges.add()
                cell_range_pb.start = range['start']
                cell_range_pb.end = range['end']

    def _add_to_recents(self, path, title=None):

        settings = Settings.retrieve('backstage')
        recents  = settings.get('recents', [ ])

        for recent in recents:
            if path == recent['path']:
                recents.remove(recent)
                break

        if is_url(path):
            location = parse.urlsplit(path).netloc
            if not title:
                title = 'Remote data set'
        else:
            title = os.path.basename(path)
            location = os.path.dirname(path)
            location = self._virtualise_path(location)

        recents.insert(0, { 'name': title, 'path': path, 'location': location })
        recents = recents[0:5]

        settings.set('recents', recents)
        settings.sync()

        self._session.notify_global_changes()

    def _on_settings(self, request=None):

        settings = Settings.retrieve('main')

        if request and request.settings:

            settings_pb = request.settings

            for setting_pb in settings_pb:
                name = setting_pb.name
                if setting_pb.valueType == jcoms.ValueType.Value('STRING'):
                    value = setting_pb.s
                elif setting_pb.valueType == jcoms.ValueType.Value('INT'):
                    value = setting_pb.i
                elif setting_pb.valueType == jcoms.ValueType.Value('DOUBLE'):
                    value = setting_pb.d
                elif setting_pb.valueType == jcoms.ValueType.Value('BOOL'):
                    value = setting_pb.b
                else:
                    continue

                if name == 'updateStatus':
                    self._session.request_update(value)
                else:
                    settings.set(name, value)

            settings.sync()

            self._session.notify_global_changes()

        response = jcoms.SettingsResponse()

        setting_pb = response.settings.add()
        setting_pb.name = 'updateStatus'
        setting_pb.s = self._session.update_status

        for name in settings:
            value = settings.get(name)
            if isinstance(value, str):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.s = value
            elif isinstance(value, bool):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.b = value
            elif isinstance(value, int):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.i = value
            elif isinstance(value, float):
                setting_pb = response.settings.add()
                setting_pb.name = name
                setting_pb.d = value

        settings = Settings.retrieve('backstage')
        recents = settings.get('recents', [ ])

        for recent in recents:
            recent_pb = response.recents.add()
            recent_pb.name = recent['name']
            recent_pb.path = recent['path']
            recent_pb.location = recent['location']

        settings = Settings.retrieve('modules')
        hidden_mods = settings.get('hidden', [ ])
        modules = Modules.instance()
        missing_mods = [ ]
        for hidden_mod in hidden_mods:
            if modules.set_visibility(hidden_mod, False) is False:
                missing_mods.append(hidden_mod)

        if len(missing_mods) > 0:
            for missing_mod in missing_mods:
                while missing_mod in hidden_mods:
                    hidden_mods.remove(missing_mod)
            settings.set('hidden', hidden_mods)
            settings.sync()

        for module in modules:
            module_pb = response.modules.add()
            self._module_to_pb(module, module_pb)

        mode = conf.get('mode', 'normal')
        conf_pb = response.config.add()
        conf_pb.name = 'mode'
        conf_pb.s = mode

        self._coms.send(response, self._instance_id, request)

    def _module_to_pb(self, module, module_pb):

        try:
            version = module.version
            version = version[:4]
            version.extend((4 - len(version)) * [0])
            version = int.from_bytes(version, byteorder='big')
        except Exception:
            version = 0

        try:
            min_version = module.min_app_version
            min_version = min_version[:4]
            min_version.extend((4 - len(min_version)) * [0])
            min_version = int.from_bytes(min_version, byteorder='big')
        except Exception:
            # makes it uninstallable
            min_version = int.from_bytes([255, 255, 255, 255], byteorder='big')

        module_pb.name = module.name
        module_pb.title = module.title
        module_pb.version = version
        module_pb.description = module.description
        module_pb.authors.extend(module.authors)
        module_pb.path = module.path
        module_pb.isSystem = module.is_sys
        module_pb.new = module.new
        module_pb.minAppVersion = min_version
        module_pb.visible = module.visible
        module_pb.incompatible = module.incompatible

        for analysis in module.analyses:
            if not analysis.in_menu:
                continue
            analysis_pb = module_pb.analyses.add()
            analysis_pb.name = analysis.name
            analysis_pb.ns = analysis.ns
            analysis_pb.title = analysis.title
            analysis_pb.menuGroup = analysis.menuGroup
            analysis_pb.menuSubgroup = analysis.menuSubgroup
            analysis_pb.menuTitle = analysis.menuTitle
            analysis_pb.menuSubtitle = analysis.menuSubtitle

    def terminate(self, message, cause=''):
        if self._coms is not None:
            self._coms.send_error(message=message, cause=cause)

    class LogHandler(logging.Handler):
        def __init__(self, instance):
            self._instance = instance
            logging.Handler.__init__(self)

        def emit(self, record):
            if self._instance._coms is None:
                return

            filename = os.path.basename(record.pathname)
            message = '{} ({}): {}'.format(filename, record.lineno, record.getMessage())
            broadcast = jcoms.LogRR(
                content=message)
            self._instance._coms.send(broadcast, self._instance._instance_id)
