
import os.path

from .utils import conf


class AppInfo:

    def __init__(self):
        self._app_name = 'jamovi'
        self._version = None

    def __str__(self):
        return self.app_name + ' ' + self.version

    @property
    def app_name(self):
        return self._app_name

    @property
    def version(self):
        if self._version is None:
            try:
                version_path = os.path.join(conf.get('home'), 'Resources', 'jamovi', 'version')
                with open(version_path, 'r', encoding='utf-8') as version_file:
                    self._version = version_file.readline().strip()
            except Exception:
                self._version = '0.0.0.0'
        return self._version


app_info = AppInfo()
