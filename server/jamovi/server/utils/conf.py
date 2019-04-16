
import sys
import re
from os import path
from os import environ
from configparser import ConfigParser

config_values = None


def set(key, value):
    global config_values
    _init()
    config_values[key] = value


def get(key, otherwise=None):
    global config_values
    _init()
    return config_values.get(key, otherwise)


def _init():
    global config_values

    if config_values is None:

        config_values = { 'debug': False }

        if 'JAMOVI_HOME' in environ:
            root = path.abspath(environ['JAMOVI_HOME'])
        else:
            root = path.realpath(path.join(path.dirname(sys.executable), '..'))

        ini_path = path.join(root, 'bin', 'env.conf')
        if not path.isfile(ini_path):
            ini_path = path.join(root, 'Resources', 'env.conf')

        config = ConfigParser()
        config.read(ini_path)

        for k in environ:
            if k.startswith('JAMOVI_'):
                config_values[k[7:].lower()] = environ[k]

        config_values['home'] = root

        app_config = config['ENV']
        for k in app_config:
            value = app_config[k]
            if k.startswith('jamovi_'):
                k = k[7:]
            if k.endswith('path') or k.endswith('home') or k.endswith('libs'):
                if value != '':
                    parts = re.split('[:;]', value)
                    parts = map(lambda x: path.normpath(path.join(root, 'bin', x)), parts)
                    value = path.pathsep.join(parts)
            config_values[k] = value
