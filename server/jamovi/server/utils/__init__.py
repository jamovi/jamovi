
# flake8: noqa

from .csvparser import CSVParser
from .htmlparser import HTMLParser

from .fileentry import FileEntry
from .nulllog import NullLog


def int32(value):
    value = int(value)
    if (value.bit_length() + 1) > 32:
        raise ValueError('Too wide for 32-bit int')

def is_int32(value):
    try:
        int32(value)
    except ValueError:
        return False
    return True
