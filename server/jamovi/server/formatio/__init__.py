
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

    if path == '':
        blank.read(data)
    elif path.endswith('.csv') or path.endswith('.txt'):
        csv.read(data, path)
    elif path.endswith('.jasp'):
        jasp.read(data, path)
    else:
        omv.read(data, path, is_example)

    data.refresh()


def write(data, path):
    omv.write(data, path)


def is_supported(filename):
    return (filename.endswith('.csv') or
            filename.endswith('.txt') or
            filename.endswith('.omv') or
            filename.endswith('.jasp'))
