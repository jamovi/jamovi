
import sys
from os import path
from os import environ
from configparser import ConfigParser
import re

config_values = None


def get(key):
    global config_values

    if config_values is None:

        if 'JAMOVI_HOME' in environ:
            root = path.abspath(environ['JAMOVI_HOME'])
        else:
            root = path.realpath(path.join(path.dirname(sys.executable), '..'))

        ini_path = path.join(root, 'bin', 'env.conf')

        config = ConfigParser()
        config.read(ini_path)

        config_values = { }

        for k in environ:
            if k.startswith('JAMOVI_'):
                config_values[k[7:].lower()] = environ[k]

        config_values['home'] = root

        app_config = config['ENV']
        for k in app_config:
            value = app_config[k]
            if k.startswith('JAMOVI_'):
                k = k[7:].lower()
            if k.endswith('_path') or k.endswith('_home'):
                vars = re.findall(r'\$([A-Z0-9_]+)', value)
                for v in vars:
                    value = value.replace('$' + v, environ[v])
                value = path.normpath(path.join(root, 'bin', value))
            config_values[k] = value

    return config_values.get(key)
