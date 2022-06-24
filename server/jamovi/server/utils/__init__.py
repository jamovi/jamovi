
# flake8: noqa

from .csvparser import CSVParser
from .htmlparser import HTMLParser

from .fileentry import FileEntry
from .nulllog import NullLog
from .latexify import latexify
from .stream import ProgressStream

import os.path
import ssl
import pkg_resources


def int32(value):
    value = int(value)
    if value > 2147483647 or value < -2147483648:
        raise ValueError('Too wide for 32-bit int')
    return value

def is_int32(value):
    try:
        int32(value)
    except ValueError:
        return False
    return True

def is_url(path):
    return path.startswith('https://') or path.startswith('http://')

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

    return '{{ iid: {}, id: {}, rev: {}, type: {}::{}, perform: {} }}'.format(
        request.instanceId[0:8],
        request.analysisId,
        request.revision,
        request.ns,
        request.name,
        perform)


context = None

def ssl_context():
    global context
    if context is None:
        chain_path = pkg_resources.resource_filename(__name__, '../resources/chain.pem')
        if os.path.isfile(chain_path):
            context = ssl.create_default_context(cafile=chain_path)
    return context
