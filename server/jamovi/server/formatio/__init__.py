
import os
import os.path
import errno
import re
import importlib

from collections import OrderedDict

from .exceptions import FileReadError
from .exceptions import FileWriteError

from . import omv
from . import blank

_readers = None
_writers = None


__all__ = ('FileReadError', 'FileWriteError')  # prevent flake whining F401


def _init():
    global _readers
    global _writers

    _readers = OrderedDict()
    _writers = OrderedDict()

    plugins = os.listdir(os.path.dirname(__file__))
    plugins_py = list(filter(lambda x: x.endswith('.py'), plugins))
    if len(plugins_py) > 0:
        plugins = plugins_py
        plugins = filter(lambda x: x != '__init__.py', plugins)
        plugins = map(lambda x: '.' + x[:-3], plugins)
    else:
        plugins = filter(lambda x: x.endswith('.pyc'), plugins)
        plugins = filter(lambda x: x != '__init__.pyc', plugins)
        plugins = map(lambda x: '.' + x[:-4], plugins)

    plugins = list(sorted(plugins))

    for plugin in plugins:
        module = importlib.import_module(plugin, 'jamovi.server.formatio')
        if hasattr(module, 'get_readers'):
            module_readers = module.get_readers()
            module_readers = map(lambda x: (x[0], x), module_readers)
            _readers.update(module_readers)
        if hasattr(module, 'get_writers'):
            module_writers = module.get_writers()
            module_writers = map(lambda x: (x[0], x), module_writers)
            _writers.update(module_writers)


def get_readers():
    global _readers
    if _readers is None:
        _init()
    return _readers


def get_writers():
    global _writers
    if _writers is None:
        _init()
    return _writers


def read(dataset, path, prog_cb, settings, *, is_temp=False, title=None, ext=None):

    with dataset.attach():
        if title:
            dataset.title = title
        else:
            dataset.title, _ = os.path.splitext(os.path.basename(path))

        if ext is None:
            ext = os.path.splitext(path)[1].lower()
            if ext != '':
                ext = ext[1:]

        prog_cb(0)

        if path == '':
            blank.read(dataset)
        elif not os.path.exists(path):
            raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), path)
        elif ext == 'omv':
            omv.read(dataset, path, prog_cb)
            if not is_temp:
                dataset.path = path
                dataset.save_format = 'jamovi'
        elif ext == 'omt':
            omv.read(dataset, path, prog_cb)
        else:
            _import(dataset, path, prog_cb, settings, ext)

        fix_column_names(dataset)

        dataset.setup()


def _import(data, path, prog_cb, settings, ext):
    readers = get_readers()

    if ext is None:
        ext = os.path.splitext(path)[1].lower()[1:]

    if ext in readers:
        readers[ext][1](data, path, prog_cb, settings=settings)
    else:
        raise RuntimeError('Unrecognised file format')

    # if not is_temp:
    #     data.import_path = path
    #
    # if _should_embed(path):
    #     try:
    #         embedded_name = os.path.basename(path)
    #         embedded_path = 'orig' + os.path.splitext(embedded_name)[1].lower()
    #         embedded_abs_path = os.path.join(data.instance_path, embedded_path)
    #         shutil.copy(path, embedded_abs_path)
    #         data.embedded_path = embedded_path
    #         data.embedded_name = embedded_name
    #     except OSError as e:
    #         print(e)
    #         pass


def write(dataset, path, prog_cb, content=None):
    writers = get_writers()
    try:
        with dataset.attach():
            temp_path = path + '.tmp'
            ext = os.path.splitext(path)[1].lower()[1:]
            if ext == 'omv' or ext == 'omt':
                omv.write(dataset, temp_path, prog_cb, content, is_template=(ext == 'omt'))
            elif ext in writers:
                writers[ext][1](dataset, temp_path, prog_cb)
            else:
                raise RuntimeError('Unrecognised file format')
        os.replace(temp_path, path)
    except Exception as e:
        try:
            os.remove(temp_path)
        except Exception:
            pass
        raise e


def is_supported(path):
    readers = get_readers()
    ext = os.path.splitext(path)[1].lower()[1:]
    return (ext in ('omv', 'omt')
            or ext in readers
            or ext in ('pdf', 'html', 'htm'))


def fix_column_names(dataset):

    dataset = dataset._dataset

    column_names = map(lambda column: column.name, dataset)
    column_names = list(column_names)

    for i, name in enumerate(column_names):
        name = re.sub(r'[\s]+', ' ', name)
        column_names[i] = name

    for i, orig in enumerate(column_names):
        used = column_names[:i]
        if orig == '':
            orig = gen_column_name(i)
        else:
            orig = re.sub(r'`',   '_', orig)
            orig = re.sub(r'^\.', '_', orig)

        name = orig.strip()
        c = 2
        while name in used:
            name = '{} ({})'.format(orig, c)
            c += 1
        column_names[i] = name

    for i, name in enumerate(column_names):
        column = dataset[i]
        if column.name != name:
            column.name = name
            column.import_name = name


def gen_column_name(index):
    name = ''
    while True:
        i = index % 26
        name = chr(i + 65) + name
        index -= i
        index = int(index / 26)
        index -= 1
        if index < 0:
            break
    return name


# def _should_embed(path):
#     import_cond = settings.get('embedCond')
#
#     if import_cond == 'never':
#         return False
#     elif import_cond == 'always':
#         return True
#     else:
#         m = re.compile(r'^\< ([1-9][0-9]*) ([KMB])b$', re.IGNORECASE).match(import_cond)
#         if m is None:
#             return False
#
#         num = int(m.group(1))
#         mul = m.group(2).upper()
#         if mul == 'K':
#             max_embed = num * 1024
#         elif mul == 'M':
#             max_embed = num * 1024 * 1024
#         elif mul == 'G':
#             max_embed = num * 1024 * 1024 * 1024
#         else:
#             max_embed = 0
#
#         return os.path.getsize(path) < max_embed
