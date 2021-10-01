
import os
import os.path
import logging
import yaml
import shutil
from zipfile import ZipFile
from asyncio import ensure_future as create_task
from collections import namedtuple

from ..core import Dirs
from ..core import PlatformInfo

from .utils import conf
from .downloader import Downloader
from .utils.stream import ProgressStream
from .appinfo import determine_r_version
from .appinfo import app_info


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
        self.incompatible = False

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
        self.defn = ''


class Modules:

    _instance = None

    LIBRARY_ROOT = 'https://library.jamovi.org/{}/R{}/'.format(app_info.os, app_info.r_version)
    LIBRARY_INDEX = 'index'

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = Modules()
        return cls._instance

    def __init__(self):
        self._read = False
        self._modules = [ ]
        self._listeners = [ ]
        self._original = None
        self._read_task = None

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

    async def read(self):
        if self._read is False:
            await self.reread()
            self._original = list(map(lambda x: x.name, self._modules))

    def read_library(self):

        if self._read_task is not None and not self._read_task.done():
            self._read_task.cancel()

        url = '{}{}'.format(Modules.LIBRARY_ROOT, Modules.LIBRARY_INDEX)
        out_stream = ProgressStream()
        in_stream = Downloader.download(url)

        async def transform():
            try:
                async for progress in in_stream:
                    out_stream.write(progress)
                modules = self.parse_modules(in_stream.result())
                out_stream.set_result(modules)
            except Exception as e:
                in_stream.cancel()
                out_stream.set_exception(e)

        self._read_task = create_task(transform())
        return out_stream

    def parse_modules(self, path):
        try:
            message = None
            modules = [ ]
            module_data = yaml.safe_load(path)
            if 'jds' not in module_data:
                raise Exception('No jds')
            jds = float(module_data['jds'])
            if jds > 1.4:
                raise ValueError('The library requires a newer version of jamovi. Please upgrade to the latest version of jamovi.')
            message = module_data.get('message')
            for defn in module_data['modules']:
                module = Modules.parse(defn)
                modules.append(module)

            LibraryContent = namedtuple('Library', 'message modules')
            content = LibraryContent(message, modules)
            return content
        except Exception as e:
            log.exception(e)
            raise ValueError('Unable to parse module list. Please try again later.')

    async def reread(self):

        module_path = conf.get('modules_path')
        user_module_path = None

        if module_path.startswith('http://') or module_path.startswith('https://'):
            remote_modules = True
        else:
            if os.name != 'nt':
                module_paths = module_path.split(':')
            else:
                module_paths = module_path.split(';')

            remote_modules = False
            user_module_path = os.path.join(Dirs.app_data_dir(), 'modules')
            os.makedirs(user_module_path, exist_ok=True)


        self._modules = [ ]

        def read_modules(pth, is_system):
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
            if remote_modules:
                try:
                    temp_file = await Downloader.download(module_path)
                    defns = yaml.safe_load_all(temp_file)
                    try:
                        for defn in defns:
                            module = Modules.parse(defn)
                            if module.name == 'jmv':
                                self._modules.insert(0, module)
                            else:
                                self._modules.append(module)
                    except Exception as e:
                        log.exception(e)
                except Exception as e:
                    log.exception(e)
            else:
                for pth in module_paths:
                    try:
                        read_modules(pth, is_system=True)
                    except Exception as e:
                        log.exception(e)

                try:
                    read_modules(user_module_path, is_system=False)
                except Exception as e:
                    log.exception(e)


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

    async def uninstall(self, name):
        module_dir = os.path.join(Dirs.app_data_dir(), 'modules', name)
        shutil.rmtree(module_dir)
        await self.reread()
        self._notify_listeners({ 'type': 'modulesChanged' })

    async def install_from_file(self, path):

        with ZipFile(path) as zip:

            module_dir = os.path.join(Dirs.app_data_dir(), 'modules')
            module_name = zip.namelist()[0].split('/')[0]
            module_path = os.path.join(module_dir, module_name)

            shutil.rmtree(module_path, ignore_errors=True)
            zip.extractall(module_dir)

        meta = self._read_module(module_path)

        await self.reread()
        self._notify_listeners({ 'type': 'moduleInstalled', 'data': { 'name': meta.name }})
        self._notify_listeners({ 'type': 'modulesChanged' })

    def install(self, path):

        out_stream = ProgressStream()

        async def download_and_install(path):

            in_stream = None
            try:
                if path.startswith(Modules.LIBRARY_ROOT):
                    in_stream = Downloader.download(path)
                    async for progress in in_stream:
                        out_stream.write(progress)
                    path = in_stream.result()

                await self.install_from_file(path)
                out_stream.set_result((1, 1))

            except Exception as e:
                if in_stream:
                    in_stream.cancel()
                out_stream.set_exception(e)

        t = create_task(download_and_install(path))
        t.add_done_callback(lambda f: f.result())

        return out_stream

    def _read_module(self, path, is_sys=False):
        defn = None
        try:
            meta_path = os.path.join(path, 'jamovi-full.yaml')
            with open(meta_path, encoding='utf-8') as stream:
                defn = yaml.safe_load(stream)
        except FileNotFoundError:
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
        if 'description' in defn:
            module.description = str(defn['description'])
        else:
            module.description = ''

        if path != '':
            module.path = path
        else:
            for arch in defn.get('architectures', [ ]):
                if arch['name'] == '*' or arch['name'] in PlatformInfo.platform():
                    module.path = Modules.LIBRARY_ROOT + arch['path']
                    break
            else:
                module.path = ''

        version = defn['version'].split('.')
        version = version[:4]
        version = list(map(int, version))
        module.version = version

        mod_r_v = defn.get('rVersion', None)
        mod_r_v = determine_r_version(mod_r_v)

        incompatible = False
        if mod_r_v != app_info.r_version:
            incompatible = True

        if 'analyses' in defn and len(defn['analyses']) > 0:
            # we don't need to mark data-sets-only modules as
            # incompatible
            module.incompatible = incompatible

        if 'requires' in defn and 'jamovi' in defn['requires']:
            min_app_version = defn['requires']['jamovi']
            min_app_version = min_app_version[2:]
            min_app_version = min_app_version.split('.')
            min_app_version = list(map(int, min_app_version))
        else:
            min_app_version = [ 0, 0, 0, 0 ]

        module.min_app_version = min_app_version

        module.authors = [ ]
        if 'authors' in defn:
            module.authors.extend(defn['authors'])

        if module.incompatible:
            return module

        if 'analyses' in defn:
            for analysis_defn in defn['analyses']:

                analysis = AnalysisMeta()
                analysis.name = analysis_defn['name']
                analysis.ns = analysis_defn['ns']
                analysis.title = analysis_defn['title']
                analysis.defn = analysis_defn

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
