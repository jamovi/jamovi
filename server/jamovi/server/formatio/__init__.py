import os
import os.path
import errno
import re
import importlib

from typing import Iterable
from typing import Any
from typing import Tuple
from typing import Dict
from typing import Union

from jamovi.server.instance import InstanceModel
from jamovi.server.dataset import DataSet

from .exceptions import FileReadError
from .exceptions import FileWriteError

from . import omv
from . import blank

from .types import GetReadersFunction
from .types import ReadFunction
from .types import Reader
from .types import ProgressCallback


_readers: Union[Dict[str, Reader], None] = None
_writers: Union[Dict[str, Any], None] = None


__all__ = ("FileReadError", "FileWriteError")  # prevent flake whining F401


def load_readers_writers() -> Tuple[Dict[str, Reader], Dict[str, Any]]:
    """load the different file format readers and writers"""
    readers = {}
    writers = {}

    plugins = os.listdir(os.path.dirname(__file__))
    plugins_py = list(filter(lambda x: x.endswith(".py"), plugins))
    if len(plugins_py) > 0:
        plugins = plugins_py
        plugins = filter(lambda x: x != "__init__.py", plugins)
        plugins = map(lambda x: "." + x[:-3], plugins)
    else:
        plugins = filter(lambda x: x.endswith(".pyc"), plugins)
        plugins = filter(lambda x: x != "__init__.pyc", plugins)
        plugins = map(lambda x: "." + x[:-4], plugins)

    plugins = list(sorted(plugins))

    for plugin in plugins:
        module = importlib.import_module(plugin, "jamovi.server.formatio")
        if hasattr(module, "get_readers"):
            module_readers = module.get_readers()
            module_readers = map(lambda x: (x[0], x), module_readers)
            readers.update(module_readers)
        if hasattr(module, "get_writers"):
            module_writers = module.get_writers()
            module_writers = map(lambda x: (x[0], x), module_writers)
            writers.update(module_writers)

    return readers, writers


def get_readers() -> Dict[str, Reader]:
    """get all the different format readers"""
    global _readers
    global _writers
    if _readers is None:
        _readers, _writers = load_readers_writers()
    return _readers


def get_writers():
    """get all the different format writers"""
    global _readers
    global _writers
    if _writers is None:
        _readers, _writers = load_readers_writers()
    return _writers


def read(
    dataset: InstanceModel,
    path: str,
    prog_cb: ProgressCallback,
    settings: dict,
    *,
    is_temp=False,
    title=None,
    ext=None,
):
    """read the file into a data set"""
    with dataset.attach():
        if title:
            dataset.title = title
        else:
            dataset.title, _ = os.path.splitext(os.path.basename(path))

        if ext is None:
            ext = os.path.splitext(path)[1].lower()
            if ext != "":
                ext = ext[1:]

        prog_cb(0)

        if path == "":
            blank.read(dataset)
        elif not os.path.exists(path):
            raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), path)
        elif ext == "omv":
            omv.read(dataset, path, prog_cb)
            if not is_temp:
                dataset.path = path
                dataset.save_format = "jamovi"
        elif ext == "omt":
            omv.read(dataset, path, prog_cb)
        else:
            _import(dataset, path, prog_cb, settings, ext)

        fix_column_names(dataset)

        dataset.setup()


def _import(
    data: InstanceModel,
    path: str,
    prog_cb: ProgressCallback,
    settings: dict,
    ext: Union[str, None],
):
    readers = get_readers()

    if ext is None:
        ext = os.path.splitext(path)[1].lower()[1:]

    if ext in readers:
        readers[ext][1](data, path, prog_cb, settings=settings)
    else:
        raise RuntimeError("Unrecognised file format")


def write(dataset: InstanceModel, path: str, prog_cb: ProgressCallback, content=None):
    """write the dataset to a file"""
    writers = get_writers()
    try:
        with dataset.attach(read_only=True):
            temp_path = path + ".tmp"
            ext = os.path.splitext(path)[1].lower()[1:]
            if ext == "omv" or ext == "omt":
                omv.write(
                    dataset, temp_path, prog_cb, content, is_template=(ext == "omt")
                )
            elif ext in writers:
                writers[ext][1](dataset, temp_path, prog_cb)
            else:
                raise RuntimeError("Unrecognised file format")
        os.replace(temp_path, path)
    except Exception as e:
        try:
            os.remove(temp_path)
        except Exception:
            pass
        raise e


def is_supported(path) -> bool:
    """determine if file format can be read"""
    readers = get_readers()
    ext = os.path.splitext(path)[1].lower()[1:]
    return ext in ("omv", "omt") or ext in readers or ext in ("pdf", "html", "htm")


def fix_column_names(dataset: InstanceModel):
    """fix the column names in a data set"""
    column_names = list(map(lambda column: column.name, dataset))
    column_names = list(map(lambda name: re.sub(r"[\s]+", " ", name), column_names))

    for i, orig in enumerate(column_names):
        used = column_names[:i]
        if orig == "":
            orig = gen_column_name(i)
        else:
            orig = re.sub(r"`", "_", orig)
            orig = re.sub(r"^\.", "_", orig)

        name = orig.strip()
        c = 2
        while name in used:
            name = f"{ orig } ({ c })"
            c += 1
        column_names[i] = name

    for i, name in enumerate(column_names):
        column = dataset[i]
        if column.name != name:
            column.name = name
            column.import_name = name


def gen_column_name(index) -> str:
    """generate a spreadsheet column name A-Z, AB, AC, etc."""
    name = ""
    while True:
        i = index % 26
        name = chr(i + 65) + name
        index -= i
        index = int(index / 26)
        index -= 1
        if index < 0:
            break
    return name
