
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
            self.library.addRemove = True
            self.library.showHide = True
            self.browse.local = True
            self.browse.examples = True
            self.open.local = True
            self.open.remote = True
            self.open.examples = True
            self.save.local = True
        elif app_mode == 'demo':
            self.library.browseable = False
            self.library.addRemove = False
            self.library.showHide = False
            self.browse.local = True
            self.browse.examples = True
            self.open.local = True
            self.open.remote = False
            self.open.examples = True
            self.save.local = False

            self.dataset.maxRows = 50000
            self.dataset.maxColumns = 100

    def __init__(self):
        self.library = AttrDict({
            'browseable': False,
            'addRemove': False,
            'showHide': False,
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

        self.dataset = AttrDict({
            'maxRows': float('inf'),
            'maxColumns': float('inf'),
        })
