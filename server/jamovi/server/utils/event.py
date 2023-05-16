

class Event:
    def __init__(self, source, name, data=None):
        self.source = source
        self.name = name
        self.data = data


class EventHook:
    def __init__(self):
        self.handlers = [ ]

    def __iadd__(self, handler):
        self.handlers.append(handler)
        return self

    def __isub__(self, handler):
        try:
            self.handlers.remove(handler)
        except Exception:
            raise ValueError('Handler is not handling this event, so cannot unhandle it.')
        return self

    def __call__(self, *args, **kargs):
        for handler in self.handlers:
            handler(*args, **kargs)

    def __len__(self):
        return len(self.handlers)
