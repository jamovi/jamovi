

import json
import os


class Backend:
    async def read_settings(self):
        return self.read_settings_nowait()

    def write_settings(self, values):
        raise NotImplementedError

    def read_settings_nowait(self):
        raise NotImplementedError

    def set_auth(self, auth):
        pass


class NoBackend(Backend):
    async def read_settings_nowait(self):
        return { }

    def write_settings(self, values):
        pass


try:
    from .backend2 import FirestoreBackend
except ModuleNotFoundError:
    class FirestoreBackend(NoBackend):
        pass


class FileSystemBackend(Backend):

    def __init__(self, *, settings_path):
        self._settings_path = settings_path

    async def read_settings(self):
        return self.read_settings_nowait()

    def read_settings_nowait(self):
        try:
            with open(self._settings_path, 'r', encoding='utf-8') as contents:
                data = json.load(contents)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print(e)
        return { }

    def write_settings(self, values):
        try:
            temp_path = self._settings_path + '.tmp'
            with open(temp_path, 'w', encoding='utf-8') as file:
                json.dump(values, file)
            os.replace(temp_path, self._settings_path)
        except Exception as e:
            print(e)
