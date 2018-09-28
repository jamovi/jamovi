
import math
from numbers import Number as num


class FValues:
    def __init__(self, parent, row_count, filt):
        self._parent = parent
        self._row_count = row_count
        self._filt = filt

    def __iter__(self):
        if self._parent.is_atomic_node():
            return [ self._parent.fvalue(0, 1, False) ].__iter__()
        else:
            return FValues.FIter(self)

    def __getitem__(self, index):
        return self._parent.fvalue(index, self._row_count, self._filt)

    class FIter:
        def __init__(self, parent):
            self._index = 0
            self._parent = parent

        def __next__(self):
            if self._index >= self._parent._row_count:
                raise StopIteration()
            try:
                v = self._parent._parent.fvalue(
                    self._index,
                    self._parent._row_count,
                    self._parent._filt)
            except BaseException:
                v = get_missing()
            self._index += 1
            return v


def get_missing(hint=None):
    if hint is None:
        return -2147483648
    if hint is int:
        return -2147483648
    elif hint is float:
        return float('nan')
    elif hint is str:
        return ''
    else:
        raise ValueError()


def is_missing(value, empty_str_is_missing=False):
    if isinstance(value, int):
        return value == -2147483648
    elif isinstance(value, float):
        return math.isnan(value)
    elif isinstance(value, str):
        if empty_str_is_missing:
            return value == ''
        else:
            return False
    elif isinstance(value, tuple):
        return value[0] == -2147483648
    else:
        return True


def convert(value, to_type):
    from_type = type(value)
    if from_type is to_type:
        return value
    elif to_type is None:
        return value
    elif to_type is num:
        if from_type is tuple:
            return value[0]
        elif from_type is str:
            return -2147483648
        else:
            return value
    elif to_type is int:
        if from_type is float:
            try:
                return int(value)
            except Exception:
                return -2147483648
        elif from_type is tuple:
            return value[0]
        else:
            return -2147483648
    elif to_type is float:
        if from_type is tuple:
            value = value[0]
            from_type = int
        if from_type is int:
            if value == -2147483648:
                return float('nan')
            else:
                return float(value)
        else:
            return float('nan')
    elif to_type is str:
        if from_type is tuple:
            return value[1]
        elif is_missing(value):
            return ''
        else:
            return str(value)
