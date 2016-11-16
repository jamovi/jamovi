
import os
import os.path
import logging
import yaml
import shutil
from zipfile import ZipFile
from silky import Dirs

log = logging.getLogger('jamovi')


class ModuleMeta:
    def __init__(self):
        self.name = None
        self.title = None
        self.version = [0, 0, 0]
        self.description = None
        self.authors = [ ]
        self.analyses = [ ]
        self.path = None
        self.is_sys = False


class AnalysisMeta:
    def __init__(self):
        self.name = None
        self.title = None
        self.subtitle = ''
        self.ns = None
        self.group = None
        self.subgroup = ''


class Modules:

    _instance = None

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

    def get(self, name):
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

    def reread(self):
        here = os.path.realpath(os.path.dirname(__file__))
        sys_module_path = os.path.join(here, 'resources', 'modules')
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
                self._read_module(entry.path, True)

            for entry in os.scandir(user_module_path):
                if entry.name == 'base':
                    continue
                if entry.is_dir() is False:
                    continue
                self._read_module(entry.path, False)
            self._read = True
        except Exception as e:
            log.exception(e)

    def uninstall(self, name):
        module_dir = os.path.join(Dirs.app_data_dir(), 'modules', name)
        shutil.rmtree(module_dir)
        self.reread()
        self._notify_listeners({ 'type': 'modulesChanged' })

    def install(self, path):
        module_dir = os.path.join(Dirs.app_data_dir(), 'modules')
        with ZipFile(path) as zip:
            zip.extractall(module_dir)
        self.reread()
        self._notify_listeners({ 'type': 'modulesChanged' })

    def _read_module(self, path, is_sys):
        try:
            meta_path = os.path.join(path, 'jamovi.yaml')
            with open(meta_path, encoding='utf-8') as stream:
                defn = yaml.safe_load(stream)

                module = ModuleMeta()
                module.path = path
                module.is_sys = is_sys
                module.name = str(defn['name'])
                module.title = str(defn['title'])
                module.description = str(defn['description'])

                version = defn['version'].split('.')
                version = version[:3]
                while len(version) < 3:
                    version.append(0)
                for i in range(3):
                    try:
                        version[i] = int(version[i])
                    except:
                        version[i] = 0
                module.version = version

                module.authors = [ ]
                module.authors.append(defn['author'])

                for analysis_defn in defn['analyses']:
                    analysis = AnalysisMeta()
                    analysis.name = analysis_defn['name']
                    analysis.ns = analysis_defn['ns']
                    analysis.title = analysis_defn['title']
                    analysis.group = analysis_defn['group']

                    if 'subtitle' in analysis_defn:
                        analysis.subtitle = analysis_defn['subtitle']
                    if 'subgroup' in analysis_defn:
                        analysis.subgroup = analysis_defn['subgroup']

                    module.analyses.append(analysis)

                self._modules.append(module)

        except Exception as e:
            log.exception(e)

    def __iter__(self):
        return self._modules.__iter__()
