
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
            self.library.sideLoad = True
            self.browse.local = True
            self.browse.examples = True
            self.open.local = True
            self.open.upload = True
            self.open.remote = True
            self.open.examples = True
            self.save.local = True
            self.save.download = True
        elif app_mode == 'cloud':
            self.library.browseable = conf.get('permissions_library_browseable', '0') == '1'
            self.library.addRemove = conf.get('permissions_library_add_remove', '0') == '1'
            self.library.showHide = conf.get('permsissions_library_show_hide', '0') == '1'
            self.library.sideLoad = False
            self.browse.local = False
            self.browse.examples = True
            self.open.local = False
            self.open.upload = True
            self.open.remote = False
            self.open.examples = True
            self.save.local = False
            self.save.download = True
            self.dataset.maxRows = int(conf.get('permissions_max_rows', '10000'))
            self.dataset.maxColumns = int(conf.get('permissions_max_columns', '100'))

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
            'upload': False,
        })

        self.save = AttrDict({
            'local': False,
            'download': False
        })

        self.dataset = AttrDict({
            'maxRows': float('inf'),
            'maxColumns': float('inf'),
        })
