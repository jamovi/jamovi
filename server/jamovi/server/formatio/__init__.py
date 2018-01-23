
import os
import os.path
import re
import shutil

from jamovi.server.settings import Settings

from . import csv
from . import omv
from . import blank
from . import jasp

settings = Settings.retrieve('main')
settings.specify_default('embedCond', '< 10 Mb')


def read(data, path, is_example=False):

    data.title = os.path.splitext(os.path.basename(path))[0]
    ext = os.path.splitext(path)[1].lower()

    if path == '':
        blank.read(data)
    elif ext == '.omv':
        omv.read(data, path)
        if not is_example:
            data.path = path
    else:
        _import(data, path, is_example)

    fix_column_names(data)

    data.setup()


def _import(data, path, is_example=False):

    ext = os.path.splitext(path)[1].lower()
    if ext == '.csv' or ext == '.txt':
        csv.read(data, path)
    elif ext == '.jasp':
        jasp.read(data, path)
    else:
        raise RuntimeError('Unrecognised file format')

    if not is_example:
        data.import_path = path

    if _should_embed(path):
        try:
            embedded_name = os.path.basename(path)
            embedded_path = 'orig' + os.path.splitext(embedded_name)[1].lower()
            embedded_abs_path = os.path.join(data.instance_path, embedded_path)
            shutil.copy(path, embedded_abs_path)
            data.embedded_path = embedded_path
            data.embedded_name = embedded_name
        except OSError as e:
            print(e)
            pass


def write(data, path, content=None):

    try:
        temp_path = path + '.tmp'
        ext = os.path.splitext(path)[1].lower()
        if ext == '.csv':
            csv.write(data, temp_path)
        else:
            omv.write(data, temp_path, content)
        os.replace(temp_path, path)
    except Exception as e:
        try:
            os.remove(temp_path)
        except Exception:
            pass
        raise e


def is_supported(path):

    ext = os.path.splitext(path)[1].lower()

    return (ext == '.csv' or
            ext == '.txt' or
            ext == '.omv' or
            ext == '.jasp' or
            ext == '.pdf' or
            ext == '.html' or
            ext == '.htm')


def fix_column_names(dataset):

    dataset = dataset._dataset

    column_names = list(map(lambda column: column.name, dataset))

    for i in range(len(column_names)):
        orig = column_names[i]
        used = column_names[:i]
        if orig == '':
            orig = gen_column_name(i)
        else:
            orig = re.sub(r'`',   '_', orig)
            orig = re.sub(r'^\.', '_', orig)

        name = orig
        c = 2
        while name in used:
            name = '{} ({})'.format(orig, c)
            c += 1
        if name != column_names[i]:
            column_names[i] = name
            dataset[i].name = name


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


def _should_embed(path):
    import_cond = settings.get('embedCond')

    if import_cond == 'never':
        return False
    elif import_cond == 'always':
        return True
    else:
        m = re.compile('^\< ([1-9][0-9]*) ([KMB])b$', re.IGNORECASE).match(import_cond)
        if m is None:
            return False

        num = int(m.group(1))
        mul = m.group(2).upper()
        if mul == 'K':
            max_embed = num * 1024
        elif mul == 'M':
            max_embed = num * 1024 * 1024
        elif mul == 'G':
            max_embed = num * 1024 * 1024 * 1024
        else:
            max_embed = 0

        return os.path.getsize(path) < max_embed
