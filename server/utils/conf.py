
import sys
from os import path
from os import environ
from configparser import ConfigParser

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

        config_values = { 'home': root }

        app_config = config['JAMOVI']
        for k in app_config:
            value = app_config[k]
            if key.endswith('_path'):
                value = path.normpath(path.join(root, 'bin', value))
            config_values[k] = value

    return config_values.get(key)
