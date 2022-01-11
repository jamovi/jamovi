
import json
import os.path

from jamovi.core import Dirs
from .utils import conf


class Settings:

    settings = None

    @staticmethod
    def retrieve(group_name=None):
        if Settings.settings is None:
            if conf.get('settings', 'file') == 'file':
                path = os.path.join(Dirs.app_data_dir(), 'settings.json')
                Settings.settings = Settings(path)
            else:
                Settings.settings = Settings(None)

        if group_name is None:
            return Settings.settings
        else:
            if group_name not in Settings.settings._children:
                Settings.settings._children[group_name] = Settings(parent=Settings.settings, name=group_name)
            return Settings.settings._children[group_name]

    def __init__(self, path=None, parent=None, name=None):
        self._path = path
        self._parent = parent
        self._name = name

        self._children = { }
        self._defaults = { }

        if path is not None:
            try:
                with open(self._path, 'r', encoding='utf-8') as file:
                    self._root = json.load(file)
                    if type(self._root) is not dict:
                        self._root = { }
            except Exception:
                self._root = { }
        elif parent is not None and name is not None:
            self._root = parent._root.get(name, { })
        else:
            self._root = { }

    def group(self, name):
        if name not in self._children:
            self._children[name] = Settings(parent=self, name=name)
        return self._children[name]

    def specify_default(self, name, value):
        self._defaults[name] = value

    def set(self, name, value):
        self._root[name] = value
        if self._parent is not None:
            self._parent.set(self._name, self._root)

    def get(self, name, default=None):
        return self._root.get(name, self._defaults.get(name, default))

    def __iter__(self):
        keys = set(self._root)
        keys.update(self._defaults)
        return keys.__iter__()

    def sync(self):
        if conf.get('settings', 'file') != 'file':
            pass
        elif self._parent is not None:
            self._parent.sync()
        else:
            try:
                temp_path = self._path + '.tmp'
                with open(temp_path, 'w', encoding='utf-8') as file:
                    json.dump(self._root, file)
                os.replace(temp_path, self._path)
            except Exception as e:
                print(e)
