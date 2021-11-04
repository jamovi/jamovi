
import os.path
import json
from functools import lru_cache

from .utils import conf


class I18n:
    def __init__(self):
        self.i18n_msgs = None
        self._code = None

    @property
    def language(self):
        return self._code

    def set_language(self, code):
        if self._code != code:
            self._code = code
            self.i18n_msgs = None

    @lru_cache(None)
    def _load_translations(self, code):
        if code:
            i18n_path = conf.get('i18n_path', None)
            if i18n_path is None:
                i18n_path = os.path.join(conf.get('home'), 'i18n')

            i18n_path = os.path.join(i18n_path, 'build')

            i18n_root = os.path.join(i18n_path, code + '.json')
            if os.path.exists(i18n_root):
                with open(i18n_root, 'r', encoding='utf-8') as stream:
                    i18n_def = json.load(stream)
                    return i18n_def['locale_data']['messages']

        return {}

    def translate(self, value):
        if self.i18n_msgs is None:
            self.i18n_msgs = self._load_translations(self._code)

        translation = value

        if self.i18n_msgs:
            trans = self.i18n_msgs.get(value)
            if trans is not None:
                translation = trans[0].strip()
                if translation == '':
                    translation = value

        return translation
