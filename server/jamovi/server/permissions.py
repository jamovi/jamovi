
from .utils import conf


class AttrDict(dict):
    __getattr__ = dict.__getitem__


class Permissions:

    _perms = None

    @staticmethod
    def retrieve():
        if Permissions._perms is not None:
            return Permissions._perms

        perms = Permissions()
        perms.setup()
        Permissions._perms = perms
        return perms

    def setup(self):
        app_mode = conf.get('mode', 'normal')
        if app_mode == 'normal':
            self.library.browseable = True
            self.library.add_remove = True
            self.library.show_hide = True
            self.browse.local = True
            self.browse.examples = True
            self.open.local = True
            self.open.examples = True
            self.save.local = True
        elif app_mode == 'demo':
            print('! DEMO MODE !')
            self.library.browseable = False
            self.library.add_remove = False
            self.library.show_hide = False
            self.browse.local = True
            self.browse.examples = True
            self.open.local = True
            self.open.examples = True
            self.save.local = False

    def __init__(self):
        self.library = AttrDict({
            'browseable': False,
            'add_remove': False,
            'show_hide': False,
        })

        self.browse = AttrDict({
            'local': False,
            'examples': False,
        })

        self.open = AttrDict({
            'local': False,
            'examples': False,
        })

        self.save = AttrDict({
            'local': False,
        })
