
import json
import os.path

from .utils.event import Event
from .utils.event import EventHook


class Settings(dict):

    def __init__(self, *, parent=None, name=None, backend=None):
        self._parent = parent
        self._name = name
        self._backend = backend

        self._children = { }
        self._defaults = { }
        self.changed = EventHook()

    async def read(self):
        data = await self._backend.read_settings()
        for group_name, group_values in data.items():
            group = self.group(group_name)
            group.update(group_values)

    async def flush(self):
        await self._backend.flush()

    def read_nowait(self):
        settings = self._backend.read_settings_nowait()
        for group_name, group_values in settings.items():
            group = self.group(group_name)
            group.update(group_values)

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
        values = dict()
        for name, group in self._children.items():
            values[name] = group
        values.update(self)
        return values
