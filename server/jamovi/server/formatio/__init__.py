
import os.path
import re

from . import csv
from . import omv
from . import blank
from . import jasp


def read(data, path, is_example=False):

    if is_example:
        data.title = os.path.splitext(os.path.basename(path))[0]
    else:
        data.title = os.path.basename(path)

    ext = os.path.splitext(path)[1].lower()

    if path == '':
        blank.read(data)
    elif ext == '.csv' or ext == '.txt':
        csv.read(data, path)
    elif ext == '.jasp':
        jasp.read(data, path)
    else:
        omv.read(data, path, is_example)

    fix_column_names(data)

    data.setup()


def write(data, path):

    ext = os.path.splitext(path)[1].lower()

    if ext == '.csv':
        csv.write(data, path)
    else:
        omv.write(data, path)


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
