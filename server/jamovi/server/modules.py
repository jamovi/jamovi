
import os
import os.path
import logging
import yaml
import shutil
from zipfile import ZipFile

from ..core import Dirs
from ..core import PlatformInfo

from .utils import conf
from .downloader import Downloader

log = logging.getLogger('jamovi')


class DataSetMeta:
    def __init__(self):
        self.module = None
        self.name = None
        self.title = None
        self.description = None
        self.tags = [ ]


class License:
    def __init__(self):
        self.name = ''
        self.url = ''


class ModuleMeta:
    def __init__(self):
        self.name = None
        self.title = None
        self.version = [0, 0, 0]
        self.description = None
        self.authors = [ ]
        self.analyses = [ ]
        self.datasets = [ ]
        self.path = None
        self.is_sys = False
        self.new = False
        self.min_app_version = 0
        self.license = None
        self.datasets_license = None
        self.visible = True


class AnalysisMeta:
    def __init__(self):
        self.name = None
        self.ns = None
        self.title = None
        self.menuGroup = ''
        self.menuSubgroup = ''
        self.menuTitle = ''
        self.menuSubtitle = ''


class Modules:

    _instance = None

    LIBRARY_ROOT = 'https://library.jamovi.org/'

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = Modules()
            cls._instance.read()
        return cls._instance

    def __init__(self):
        self._read = False
        self._modules = [ ]
        self._listeners = [ ]
        self._original = None

    def get(self, name):
        for module in self._modules:
            if module.name == name:
                return module
        raise KeyError()

    def __getitem__(self, name):
        for module in self._modules:
            if module.name == name:
                return module
        raise KeyError()

    def add_listener(self, listener):
        self._listeners.append(listener)

    def remove_listener(self, listener):
        self._listeners.remove(listener)

    def _notify_listeners(self, event):
        for listener in self._listeners:
            listener(event)

    def read(self):
        if self._read is False:
            self.reread()
            self._original = list(map(lambda x: x.name, self._modules))

    def read_store(self, callback):
        Downloader.download(
            Modules.LIBRARY_ROOT + 'modules.yaml',
            lambda t, res: self._read_store_callback(t, res, callback))

    def _read_store_callback(self, t, result, callback):
        if t == 'progress':
            callback('progress', result)
        elif t == 'error':
            callback('error', result)
        elif t == 'success':
            try:
                modules = [ ]
                module_data = yaml.load(result)
                if 'jds' not in module_data:
                    raise Exception('No jds')
                jds = float(module_data['jds'])
                if jds > 1.4:
                    callback('error', 'The library requires a newer version of jamovi. Please upgrade to the latest version of jamovi.')
                    return
                for defn in module_data['modules']:
                    module = Modules.parse(defn)
                    modules.append(module)
                callback('success', modules)
            except Exception as e:
                log.exception(e)
                callback('error', 'Unable to parse module list. Please try again later.')
        else:
            log.error("_read_store_callback(): shouldn't get here")

    def reread(self):

        sys_module_path = conf.get('modules_path')
        user_module_path = os.path.join(Dirs.app_data_dir(), 'modules')

        os.makedirs(sys_module_path, exist_ok=True)
        os.makedirs(user_module_path, exist_ok=True)

        self._modules = [ ]

        try:
            for entry in os.scandir(sys_module_path):
                if entry.name == 'base':
                    continue
                if entry.is_dir() is False:
                    continue
                try:
                    module = self._read_module(entry.path, True)
                    if module.name == 'jmv':
                        self._modules.insert(0, module)
                    else:
                        self._modules.append(module)
                except Exception as e:
                    log.exception(e)

            for entry in os.scandir(user_module_path):
                if entry.name == 'base':
                    continue
                if entry.is_dir() is False:
                    continue
                try:
                    module = self._read_module(entry.path, False)
                    module.new = self._read and (module.name in self._original) is False
                    self._modules.append(module)
                except Exception as e:
                    log.exception(e)
            self._read = True
        except Exception as e:
            log.exception(e)

    def set_visibility(self, name, value):
        for module in self._modules:
            if module.name == name:
                module.visible = value
                return True
        return False

    def uninstall(self, name):
        module_dir = os.path.join(Dirs.app_data_dir(), 'modules', name)
        shutil.rmtree(module_dir)
        self.reread()
        self._notify_listeners({ 'type': 'modulesChanged' })

    def install(self, path, callback):
        if path.startswith(Modules.LIBRARY_ROOT):
            Downloader.download(
                path,
                lambda t, result: self._on_install(t, result, callback))
        else:
            self._on_install('success', path, callback)

    def _on_install(self, t, result, callback):
        if t == 'error':
            callback('error', result)
        elif t == 'progress':
            callback('progress', result)
        elif t == 'success':
            try:
                with ZipFile(result) as zip:

                    module_dir = os.path.join(Dirs.app_data_dir(), 'modules')
                    module_name = zip.namelist()[0].split('/')[0]
                    module_path = os.path.join(module_dir, module_name)

                    shutil.rmtree(module_path, ignore_errors=True)
                    zip.extractall(module_dir)

                meta = self._read_module(module_path)

                self.reread()
                self._notify_listeners({ 'type': 'moduleInstalled', 'data': { 'name': meta.name }})
                self._notify_listeners({ 'type': 'modulesChanged' })
                callback('success', None)
            except Exception as e:
                log.exception(e)
                callback('error', e)
        else:
            log.error("Modules._on_install(): shouldn't get here.")

    def _read_module(self, path, is_sys=False):
        meta_path = os.path.join(path, 'jamovi.yaml')
        with open(meta_path, encoding='utf-8') as stream:
            defn = yaml.safe_load(stream)
            return Modules.parse(defn, path, is_sys)

    def __iter__(self):
        return self._modules.__iter__()

    @staticmethod
    def parse(defn, path='', is_sys=False):
        module = ModuleMeta()
        module.path = path
        module.is_sys = is_sys
        module.name = str(defn['name'])
        module.title = str(defn['title'])
        module.description = str(defn['description'])

        if path != '':
            module.path = path
        else:
            for arch in defn['architectures']:
                if arch['name'] == '*' or arch['name'] in PlatformInfo.platform():
                    module.path = Modules.LIBRARY_ROOT + arch['path']
                    break
            else:
                module.path = ''

        version = defn['version'].split('.')
        version = version[:4]
        version = list(map(int, version))
        module.version = version

        if 'requires' in defn and 'jamovi' in defn['requires']:
            min_app_version = defn['requires']['jamovi']
            min_app_version = min_app_version[2:]
            min_app_version = min_app_version.split('.')
            min_app_version = list(map(int, min_app_version))
        else:
            min_app_version = [ 0, 0, 0, 0 ]

        module.min_app_version = min_app_version

        module.authors = [ ]
        module.authors.extend(defn['authors'])

        if 'analyses' in defn:
            for analysis_defn in defn['analyses']:
                if 'hidden' in analysis_defn and analysis_defn['hidden'] is True:
                    continue
                analysis = AnalysisMeta()
                analysis.name = analysis_defn['name']
                analysis.ns = analysis_defn['ns']
                analysis.title = analysis_defn['title']

                analysis.menuGroup = analysis_defn['menuGroup']
                analysis.menuTitle = analysis_defn['menuTitle']

                if 'menuSubgroup' in analysis_defn and analysis_defn['menuSubgroup'] is not None:
                    analysis.menuSubgroup = analysis_defn['menuSubgroup']
                if 'menuSubtitle' in analysis_defn and analysis_defn['menuSubtitle'] is not None:
                    analysis.menuSubtitle = analysis_defn['menuSubtitle']

                module.analyses.append(analysis)

        if 'datasets' in defn:
            for dataset_defn in defn['datasets']:
                dataset = DataSetMeta()
                dataset.name = dataset_defn['name']
                dataset.path = dataset_defn['path']
                dataset.description = dataset_defn['description']
                if 'tags' in dataset_defn:
                    dataset.tags[:] = dataset_defn['tags']
                module.datasets.append(dataset)

        if 'license' in defn:
            license_info = defn['license']
            if 'name' in license_info:
                module.license = License()
                module.license.name = license_info['name']
                module.license.url = license_info['url']
            else:
                if 'main' in license_info:
                    module.license = License()
                    module.license.name = license_info['main']['name']
                    module.license.url  = license_info['main']['url']
                    module.datasets_license = License()
                    module.datasets_license.name = license_info['main']['name']
                    module.datasets_license.url  = license_info['main']['url']
                if 'datasets' in license_info:
                    module.datasets_license = License()
                    module.datasets_license.name = license_info['datasets']['name']
                    module.datasets_license.url  = license_info['datasets']['url']

        return module
