

from jamovi.core import MeasureType


class FuncMeta:
    def __init__(self):
        self.is_row_wise = False
        self.is_column_wise = False
        self._measure_type = MeasureType.CONTINUOUS
        self._returns = [ ]

    def __str__(self):
        return str({
            'is_row_wise': self.is_row_wise,
            'is_column_wise': self.is_column_wise,
            'measure_type': self._measure_type,
            'returns': self._returns,
        })

    def set_m_type(self, m_type):
        self._measure_type = m_type

    def determine_m_type(self, args):
        if len(self._returns) == 0:
            return self._measure_type
        if len(args) == 0:
            return self._measure_type

        # not sure why this doesn't work:
        # types = map(lambda i: args[i].measure_type, self._returns)
        #
        # had to do this instead:
        types = [None] * len(self._returns)
        for i in range(len(self._returns)):
            arg_i = self._returns[i]
            if arg_i < len(args):
                types[i] = args[arg_i].measure_type

        mt = MeasureType.NOMINAL
        for t in list(types):
            if t is MeasureType.ORDINAL and mt is MeasureType.NOMINAL:
                mt = MeasureType.ORDINAL
            elif t is MeasureType.CONTINUOUS:
                mt = MeasureType.CONTINUOUS
            elif t is MeasureType.NOMINAL_TEXT:
                mt = MeasureType.NOMINAL_TEXT
                break

        return mt


def _meta(func):
    if not hasattr(func, 'meta'):
        func.meta = FuncMeta()
    return func.meta


def returns(mt, *args):
    def inner(func):
        meta = _meta(func)
        meta._measure_type = mt
        meta._returns = args
        return func
    return inner


# row function decorator
def row_wise(func):
    meta = _meta(func)
    meta.is_row_wise = True
    meta.is_column_wise = False
    return func


# column function decorator
def column_wise(func):
    meta = _meta(func)
    meta.is_row_wise = False
    meta.is_column_wise = True
    return func
