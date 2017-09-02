
import os.path

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
