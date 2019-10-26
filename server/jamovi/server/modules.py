
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

    def get(self, name):
        for analysis in self.analyses:
            if analysis.name == name:
                return analysis
        else:
            return None

    def __getitem__(self, name):
        for analysis in self.analyses:
            if analysis.name == name:
                return analysis
        else:
            raise KeyError


class AnalysisMeta:
    def __init__(self):
        self.name = None
        self.ns = None
        self.title = None
        self.menuGroup = ''
        self.menuSubgroup = ''
        self.menuTitle = ''
        self.menuSubtitle = ''
        self.addon_for = None
        self.addons = [ ]
        self.in_menu = True


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

        if ':' in sys_module_path:
            sys_module_paths = sys_module_path.split(':')
        else:
            sys_module_paths = sys_module_path.split(';')

        for pth in sys_module_paths:
            os.makedirs(pth, exist_ok=True)
        os.makedirs(user_module_path, exist_ok=True)

        self._modules = [ ]

        def scan_for_modules(pth, is_system):
            for entry in os.scandir(pth):
                if entry.name == 'base':
                    continue
                if entry.is_dir() is False:
                    continue
                try:
                    module = self._read_module(entry.path, is_system)
                    if not is_system:
                        module.new = self._read and (module.name in self._original) is False

                    if module.name == 'jmv':
                        self._modules.insert(0, module)
                    else:
                        self._modules.append(module)
                except Exception as e:
                    log.exception(e)

        try:
            for pth in sys_module_paths:
                scan_for_modules(pth, is_system=True)

            scan_for_modules(user_module_path, is_system=False)

            # fill in addons
            modules_by_name = dict(map(lambda m: (m.name, m), self._modules))
            for module in self._modules:
                for analysis in module.analyses:
                    if analysis.addon_for is not None:
                        try:
                            target_module = modules_by_name.get(analysis.addon_for[0])
                            target_analysis = next(iter(filter(lambda a: a.name == analysis.addon_for[1], target_module.analyses)))
                            target_analysis.addons.append((analysis.ns, analysis.name))
                        except Exception:
                            pass

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
                if 'addonFor' in analysis_defn:
                    analysis.in_menu = False
                    analysis.addon_for = analysis_defn['addonFor'].split('::')
                if 'hidden' in analysis_defn and analysis_defn['hidden'] is True:
                    analysis.in_menu = False

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
