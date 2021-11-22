
import os.path
import json
from functools import lru_cache

from .utils import conf

i18n_msgs = None
_code = None

def get_language():
    global _code
    return _code

def set_language(code):
    global _code
    global i18n_msgs
    if _code != code:
        _code = code
        i18n_msgs = None

@lru_cache(None)
def _load_translations(code):
    if code:
        i18n_path = conf.get('i18n_path', None)
        if i18n_path is None:
            i18n_path = os.path.join(conf.get('home'), 'i18n', 'json')

        i18n_root = os.path.join(i18n_path, code + '.json')
        if os.path.exists(i18n_root):
            with open(i18n_root, 'r', encoding='utf-8') as stream:
                i18n_def = json.load(stream)
                return i18n_def['locale_data']['messages']

    return {}

def _(value):
    global _code
    global i18n_msgs
    if i18n_msgs is None:
        i18n_msgs = _load_translations(_code)

    translation = value

    if i18n_msgs:
        trans = i18n_msgs.get(value)
        if trans is not None:
            translation = trans[0].strip()
            if translation == '':
                translation = value

    return translation
