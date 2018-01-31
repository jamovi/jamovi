
import random
import math
from numbers import Number as num
import statistics as stats

from scipy.stats import boxcox

from jamovi.core import MeasureType
from jamovi.server.utils import is_missing

from .funcmeta import row_wise
from .funcmeta import column_wise
from .funcmeta import returns


NaN = float('nan')


@row_wise
def MEAN(index, arg0: float, *args: float):
    values = [ arg0 ]
    values.extend(args)
    return stats.mean(values)


@row_wise
def SUM(index, arg0: float, *args: float):
    values = [ arg0 ]
    values.extend(args)
    return math.fsum(values)


@row_wise
@returns(MeasureType.CONTINUOUS, 0)
def ABS(index, value: num):
    if is_missing(value):
        return value
    return abs(value)


@row_wise
def EXP(index, value: float):
    return math.exp(value)


@row_wise
def LN(index, value: float):
    return math.log(value)


@row_wise
def LOG10(index, value: float):
    return math.log10(value)


@row_wise
def SQRT(index, value: float):
    return math.sqrt(value)


@row_wise
def UNIF(index, a: float=0.0, b: float=1.0):
    return random.uniform(a, b)


@row_wise
def NORM(index, mu: float=0.0, sd: float=1.0):
    return random.gauss(mu, sd)


@row_wise
def BETA(index, alpha: float=1.0, beta: float=1.0):
    return random.betavariate(alpha, beta)


@row_wise
def GAMMA(index, alpha: float=1.0, beta: float=1.0):
    return random.gammavariate(alpha, beta)


@row_wise
@returns(MeasureType.ORDINAL)
def ROW(index):
    return index + 1


@column_wise
def VMEAN(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.mean(values)


@column_wise
def VSTDEV(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.stdev(values)


@column_wise
def VSE(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.pstdev(values)


@column_wise
def VVAR(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.variance(values)


@column_wise
def VMED(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.median(values)


@column_wise
def VMODE(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.mode(values)


@column_wise
@returns(MeasureType.ORDINAL)
def VN(values):
    values = filter(lambda v: not is_missing(v), values)
    return sum(1 for _ in values)


@column_wise
def VSUM(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return math.fsum(values)


@column_wise
def VROWS(values):
    return sum(1 for _ in values)


@column_wise
def VBOXCOXLAMBDA(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    values = list(values)
    return boxcox(values)[1]


@row_wise
def BOXCOX(index, x: float, lmbda: float=VBOXCOXLAMBDA):
    return boxcox(x=x, lmbda=lmbda)


@row_wise
def Z(index, x: float, mean: float=VMEAN, sd: float=VSTDEV):
    return (x - mean) / sd


@row_wise
def SCALE(index, x: float, mean: float=VMEAN, sd: float=VSTDEV):
    return (x - mean) / sd


@row_wise
@returns(MeasureType.NOMINAL, 0)
def OFFSET(index, x, offset: int):
    # this is handled specially elsewhere
    return x


@row_wise
@returns(MeasureType.NOMINAL, 1)
def IF(index, cond: int, x=1):
    if is_missing(cond, True):
        return -2147483648
    return x if cond else -2147483648


@row_wise
@returns(MeasureType.NOMINAL, 1, 2)
def IFELSE(index, cond: int, x=1, y=0):
    if is_missing(cond, True):
        return -2147483648
    return x if cond else y


@row_wise
@returns(MeasureType.NOMINAL, 1, 2)
def IFMISS(index, cond, x=1, y=-2147483648):
    return x if is_missing(cond, empty_str_is_missing=True) else y


@row_wise
def NOT(index, x):
    if is_missing(x):
        return x
    return 1 if not x else 0


@row_wise
def FILTER(index, x, cond: int):
    if is_missing(cond, True):
        return -2147483648
    return x if cond else -2147483648


@row_wise
@returns(MeasureType.NOMINAL_TEXT)
def TEXT(index, x: str):
    return x


@row_wise
@returns(MeasureType.CONTINUOUS)
def VALUE(index, x: str):
    return float(x)


@row_wise
@returns(MeasureType.ORDINAL)
def INT(index, x: str):
    return int(float(x))
