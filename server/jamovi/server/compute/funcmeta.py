
from jamovi.core import DataType
from jamovi.core import MeasureType


class FuncMeta:
    def __init__(self):
        self.is_row_wise = False
        self.is_column_wise = False
        self._data_type = DataType.DECIMAL
        self._measure_type = MeasureType.CONTINUOUS
        self._returns = [ ]
        self._arg_level_indices = [ ]

    def __str__(self):
        return str({
            'is_row_wise': self.is_row_wise,
            'is_column_wise': self.is_column_wise,
            'measure_type': self._measure_type,
            'returns': self._returns,
        })

    @property
    def m_type(self):
        return self._measure_type

    def set_m_type(self, m_type):
        self._measure_type = m_type

    @property
    def d_type(self):
        return self._data_type

    def set_d_type(self, d_type):
        self._d_type = d_type

    @property
    def returns(self):
        return self._returns

    @property
    def arg_level_indices(self):
        return self._arg_level_indices


def _meta(func):
    if not hasattr(func, 'meta'):
        func.meta = FuncMeta()
    return func.meta


def returns(dt, mt, args_to_determine_from=[]):
    if isinstance(args_to_determine_from, int):
        args_to_determine_from = [ args_to_determine_from ]

    def inner(func):
        meta = _meta(func)
        meta._data_type = dt
        meta._measure_type = mt
        meta._returns = args_to_determine_from
        return func
    return inner


def levels(args_to_determine_from):
    if isinstance(args_to_determine_from, int):
        args_to_determine_from = [ args_to_determine_from ]

    def inner(func):
        meta = _meta(func)
        meta._arg_level_indices = args_to_determine_from
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
