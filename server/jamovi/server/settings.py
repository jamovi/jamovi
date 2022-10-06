
import json
import os.path

from asyncio import Future
from asyncio import create_task

from .utils.event import Event
from .utils.event import EventHook

local_settings_keys = ('updateStatus',)


class Settings(dict):

    def __init__(self, *, parent=None, name=None, backend=None):
        self._parent = parent
        self._name = name
        self._backend = backend
        self._children = { }
        self._defaults = { }
        self._read = False
        self.changed = EventHook()

    def read_nowait(self):
        if not self._backend.is_synchronous():
            return
        settings = self._backend.read_settings_nowait()
        for group_name, group_values in settings.items():
            group = self.group(group_name)
            group.update(group_values)
        self._read = True

    async def flush(self):
        await self._backend.flush()

    async def read(self):
        if self._read:
            return
        if self._backend.is_synchronous():
            return
        settings = await self._backend.read_settings()
        for group_name, group_values in settings.items():
            group = self.group(group_name)
            group.update(group_values)
        self._read = True

    def apply(self, settings: dict):
        for group_name, group_values in settings.items():
            group = self.group(group_name)
            group.update(group_values)
        self.write()

    def write(self):
        if self._parent is not None:
            self._parent.write()
        else:
            data = self.vanilla_dict()
            self._backend.set_settings(data)

    def group(self, name):
        if name not in self._children:
            self._children[name] = Settings(parent=self, name=name)
        return self._children[name]

    def specify_default(self, name, value):
        self._defaults[name] = value

    def set(self, name, value):
        try:
            if self[name] == value:
                return
        except KeyError:
            pass
        self[name] = value
        event = Event(self, 'changed', [ name ])
        self.changed(event)

    def get(self, name, default=None):
        return super().get(name, self._defaults.get(name, default))

    def update(self, values):
        changed = [ ]
        for key, value in values.items():
            try:
                if self[key] != value:
                    changed.append(key)
            except KeyError:
                changed.append(key)
        if changed:
            super().update(values)
            event = Event(self, 'changed', changed)
            self.changed(event)

    def __iter__(self):
        keys = set()
        try:
            itr = super().__iter__()
            while True:
                keys.add(next(itr))
        except StopIteration:
            pass
        keys.update(self._defaults)
        return keys.__iter__()

    def vanilla_dict(self):
        groups = dict()
        for name, group in self._children.items():
            group_ex_local = dict((k, v) for k, v in group.items() if k not in local_settings_keys)
            groups[name] = group_ex_local
        groups.update(self)
        return groups
