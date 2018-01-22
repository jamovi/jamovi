
import statistics as stats
import random
import math

from scipy.stats import boxcox

from .funcmeta import row_wise
from .funcmeta import column_wise


NaN = float('nan')


@row_wise
def MEAN(index, arg0: float, *args: float) -> float:
    values = [ arg0 ]
    values.extend(args)
    return stats.mean(values)


@row_wise
def SUM(index, arg0: float, *args: float) -> float:
    values = [ arg0 ]
    values.extend(args)
    return math.fsum(values)


@row_wise
def ABS(index, value: float) -> float:
    return math.fabs(value)


@row_wise
def EXP(index, value: float) -> float:
    return math.exp(value)


@row_wise
def LN(index, value: float) -> float:
    return math.log(value)


@row_wise
def LOG10(index, value: float) -> float:
    return math.log10(value)


@row_wise
def SQRT(index, value: float) -> float:
    return math.sqrt(value)


@row_wise
def UNIF(index, a: float=0.0, b: float=1.0) -> float:
    return random.uniform(a, b)


@row_wise
def NORM(index, mu: float=0.0, sd: float=1.0) -> float:
    return random.gauss(mu, sd)


@row_wise
def BETA(index, alpha: float=1.0, beta: float=1.0) -> float:
    return random.betavariate(alpha, beta)


@row_wise
def GAMMA(index, alpha: float=1.0, beta: float=1.0) -> float:
    return random.gammavariate(alpha, beta)


@row_wise
def ROW(index) -> int:
    return index + 1


@column_wise
def VMEAN(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    return stats.mean(values)


@column_wise
def VSTDEV(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    return stats.stdev(values)


@column_wise
def VSE(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    return stats.pstdev(values)


@column_wise
def VVAR(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    return stats.variance(values)


@column_wise
def VMED(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    return stats.median(values)


@column_wise
def VMODE(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    return stats.mode(values)


@column_wise
def VSUM(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    return math.fsum(values)


@column_wise
def VROWS(values) -> float:
    return sum(1 for _ in values)


@column_wise
def VBOXCOXLAMBDA(values) -> float:
    values = filter(lambda x: not math.isnan(x), values)
    values = list(values)
    return boxcox(values)[1]


@row_wise
def BOXCOX(index, x: float, lmbda: float=VBOXCOXLAMBDA) -> float:
    return boxcox(x=x, lmbda=lmbda)


@row_wise
def Z(index, x: float, mean: float=VMEAN, sd: float=VSTDEV) -> float:
    return (x - mean) / sd


@row_wise
def SCALE(index, x: float, mean: float=VMEAN, sd: float=VSTDEV) -> float:
    return (x - mean) / sd


@row_wise
def OFFSET(index, x: float, offset: int) -> float:
    return x
