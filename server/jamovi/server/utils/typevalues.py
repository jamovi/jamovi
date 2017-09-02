
class FValues:
    def __init__(self, parent):
        self._parent = parent

    def __iter__(self):
        if self._parent.is_atomic_node():
            return [ self._parent.fvalue(0) ].__iter__()
        else:
            return FValues.FIter(self)

    def __getitem__(self, index):
        return self._parent.fvalue(index)

    class FIter:
        def __init__(self, parent):
            self._index = 0
            self._parent = parent

        def __next__(self):
            try:
                v = self._parent._parent.fvalue(self._index)
                self._index += 1
                return v
            except IndexError:
                raise StopIteration()
