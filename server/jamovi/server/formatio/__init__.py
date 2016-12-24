
from . import csv
from . import omv
from . import blank
from . import jasp


def read(data, path):
    if path == '':
        blank.read(data)
    elif path.endswith('.csv') or path.endswith('.txt'):
        csv.read(data, path)
    elif path.endswith('.jasp'):
        jasp.read(data, path)
    else:
        omv.read(data, path)


def write(data, path):
    omv.write(data, path)


def is_supported(filename):
    return (filename.endswith('.csv') or
            filename.endswith('.txt') or
            filename.endswith('.omv') or
            filename.endswith('.jasp'))
