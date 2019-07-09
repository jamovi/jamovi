
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

def req_str(request):
    if request.perform == 0:
        perform = 'init'
    elif request.perform == 1:
        perform = 'run'
    elif request.perform == 4:
        perform = 'render'
    elif request.perform == 5:
        perform = 'save'
    elif request.perform == 6:
        perform = 'delete'
    elif request.perform == 7:
        perform = 'duplicate'
    else:
        perform = request.perform

    return '{{ iid: {}, id: {}, rev: {}, perform: {} }}'.format(
        request.instanceId[0:8],
        request.analysisId,
        request.revision,
        perform)
