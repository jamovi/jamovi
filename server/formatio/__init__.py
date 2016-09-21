
from . import csv
from . import osilky
from . import blank


def read(dataset, path):
    if path == '':
        blank.read(dataset)
    elif path.endswith('.csv') or path.endswith('.txt'):
        csv.read(dataset, path)
    elif path.endswith('.jasp'):
        osilky.read(dataset, path)
    else:
        osilky.read(dataset, path)


def write(dataset, path):
    osilky.write(dataset, path)


def is_supported(filename):
    return (filename.endswith('.csv') or
            filename.endswith('.txt') or
            filename.endswith('.osilky') or
            filename.endswith('.jasp'))
