
# vectorised versions of the column-wise functions in functions.py. each takes
# its input column as an array of decimals (missing values NaN), and gives (or
# raises) what the function in functions.py does for the same values. sums use
# math.fsum() (as the functions do), and means, variances and medians match
# them to within rounding. with infinities, the function in functions.py is
# used, as numpy and statistics treat them differently

import itertools
import math
import statistics

import numpy as np

from . import functions


def _present(x):
    return x[~np.isnan(x)]


def _fsum(v):
    # math.fsum() of the values, without them all as a list at once
    return math.fsum(itertools.chain.from_iterable(
        v[i:i + 65536].tolist() for i in range(0, len(v), 65536)))


def _finite(func):
    # use the function in functions.py if there are infinities
    original = getattr(functions, func.__name__)

    def inner(x):
        if np.any(np.isinf(x)):
            return original(x.tolist())
        return func(x)
    inner.__name__ = func.__name__
    return inner


def _variance(v):
    n = len(v)
    if n < 2:
        raise statistics.StatisticsError('variance requires at least two data points')
    # about the first value, so equal values are exactly 0
    d = v - v[0]
    mean = np.sum(d) / n
    return float(np.sum((d - mean) ** 2) / (n - 1))


@_finite
def VMEAN(x):
    v = _present(x)
    if len(v) == 0:
        raise statistics.StatisticsError('mean requires at least one data point')
    return _fsum(v) / len(v)


@_finite
def VSTDEV(x):
    return math.sqrt(_variance(_present(x)))


@_finite
def VVAR(x):
    return _variance(_present(x))


@_finite
def VSE(x):
    v = _present(x)
    return math.sqrt(_variance(v) / len(v))


@_finite
def VMED(x):
    v = _present(x)
    if len(v) == 0:
        raise statistics.StatisticsError('no median for empty data')
    return float(np.median(v))


@_finite
def VMAD(x):
    median = VMED(x)
    return VMED(np.abs(x - median))


@_finite
def VMADR(x):
    return VMAD(x) * 1.4826


@_finite
def VMODE(x):
    v = _present(x)
    if len(v) == 0:
        raise statistics.StatisticsError('no mode for empty data')
    # the most common, and of those, the first
    _, first, counts = np.unique(v, return_index=True, return_counts=True)
    return float(v[np.min(first[counts == np.max(counts)])])


@_finite
def VMIN(x):
    v = _present(x)
    if len(v) == 0:
        raise ValueError('min() iterable argument is empty')
    return float(np.min(v))


@_finite
def VMAX(x):
    v = _present(x)
    if len(v) == 0:
        raise ValueError('max() iterable argument is empty')
    return float(np.max(v))


def VSUM(x):
    return _fsum(_present(x))


def VN(x):
    return int(np.sum(~np.isnan(x)))


def VROWS(x):
    return len(x)


def Q1(x):
    return functions.Q1(x.tolist())


def Q3(x):
    return functions.Q3(x.tolist())


def VBOXCOXLAMBDA(x):
    return functions.VBOXCOXLAMBDA(x.tolist())


FUNCTIONS = {
    func.__name__: func for func in (
        VMEAN, VSTDEV, VVAR, VSE, VMED, VMAD, VMADR, VMODE, VMIN, VMAX,
        VSUM, VN, VROWS, Q1, Q3, VBOXCOXLAMBDA)
}
