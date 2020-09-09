
import random
import math
from numbers import Number as num
import statistics as stats

from scipy.stats import boxcox
# numpy, scipy return numpy.float64's, so need to convert back to float

from jamovi.core import DataType
from jamovi.core import MeasureType
from jamovi.server.compute import is_missing
from jamovi.server.compute import is_equal

from .funcmeta import row_wise
from .funcmeta import column_wise
from .funcmeta import returns
from .funcmeta import levels


NaN = float('nan')


@row_wise
def MAX(index, arg0: float, *args: float):
    values = [ arg0 ]
    values.extend(args)
    values = list(filter(lambda x: not is_missing(x), values))
    return max(values)


@row_wise
def MEAN(index, arg0: float, *args: float, ignore_missing: int = 0):
    values = [ arg0 ]
    values.extend(args)
    if ignore_missing != 0:
        values = list(filter(lambda x: not is_missing(x), values))
    return stats.mean(values)


@row_wise
def MIN(index, arg0: float, *args: float):
    values = [ arg0 ]
    values.extend(args)
    values = list(filter(lambda x: not is_missing(x), values))
    return min(values)


@row_wise
def STDEV(index, arg0: float, *args: float, ignore_missing: int = 0):
    values = [ arg0 ]
    values.extend(args)
    if ignore_missing != 0:
        values = list(filter(lambda x: not is_missing(x), values))
    return stats.stdev(values)


@row_wise
def SUM(index, arg0: float, *args: float, ignore_missing: int = 0):
    values = [ arg0 ]
    values.extend(args)
    if ignore_missing != 0:
        values = list(filter(lambda x: not is_missing(x), values))
    return math.fsum(values)


@row_wise
@returns(DataType.DECIMAL, MeasureType.CONTINUOUS, 0)
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
def UNIF(index, a: float = 0.0, b: float = 1.0):
    return random.uniform(a, b)


@row_wise
def NORM(index, mu: float = 0.0, sd: float = 1.0):
    return random.gauss(mu, sd)


@row_wise
def BETA(index, alpha: float = 1.0, beta: float = 1.0):
    return random.betavariate(alpha, beta)


@row_wise
@returns(DataType.INTEGER, MeasureType.ORDINAL)
def MATCH(index, needle, *haystack):
    if is_missing(needle):
        -2147483648
    for index, value in enumerate(haystack):
        if is_equal(needle, value):
            return index + 1
    else:
        return -2147483648


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL, range(1, 10000))
@levels(range(1, 10000))
def HLOOKUP(index, lookup_index: int, *args):
    lookup_index -= 1  # was indexed from 1
    if lookup_index >= 0 and lookup_index < len(args):
        return args[lookup_index]
    else:
        return -2147483648


@row_wise
def GAMMA(index, alpha: float = 1.0, beta: float = 1.0):
    return random.gammavariate(alpha, beta)


@row_wise
@returns(DataType.INTEGER, MeasureType.ORDINAL)
def ROW(index):
    return index + 1


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL)
def NOTROW(index, arg0, *args):
    if (index + 1) == arg0:
        return 0
    elif (index + 1) in args:
        return 0
    return 1


@column_wise
def Q1(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.quantiles(values, method = "inclusive")[0]


@column_wise
def Q3(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return stats.quantiles(values, method = "inclusive")[2]


@row_wise
def IIQR(index, value: float, q1: float, q3: float):
    if value < q1:
        value = (value - q1) / (q3 - q1)
    elif value > q3:
        value = (value - q3) / (q3 - q1)
    else:
        value = 0
    return value


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
    values = list(filter(lambda x: not math.isnan(x), values))
    n = sum(1 for _ in values)
    return math.sqrt(stats.variance(values) / n)


@row_wise
def VAR(index, arg0: float, *args: float, ignore_missing: int = 0):
    values = [ arg0 ]
    values.extend(args)
    if ignore_missing != 0:
        values = list(filter(lambda x: not is_missing(x), values))
    return stats.variance(values)


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
@returns(DataType.INTEGER, MeasureType.ORDINAL)
def VN(values):
    values = filter(lambda v: not is_missing(v), values)
    return sum(1 for _ in values)


@column_wise
def VSUM(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return math.fsum(values)


@column_wise
@returns(DataType.INTEGER, MeasureType.ORDINAL)
def VROWS(values):
    return sum(1 for _ in values)


@column_wise
def VMIN(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return min(values)


@column_wise
def VMAX(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    return max(values)


@column_wise
def VBOXCOXLAMBDA(values: float):
    values = filter(lambda x: not math.isnan(x), values)
    values = list(values)
    # numpy returns numpy.float64, so need to convert back to float
    return float(boxcox(values)[1])


@row_wise
def BOXCOX(index, x: float, lmbda: float = VBOXCOXLAMBDA):
    if lmbda > 0:
        return (x ** lmbda - 1) / lmbda
    elif lmbda == 0:
        return math.log(x)
    else:
        return NaN


@row_wise
def Z(index, x: float):
    # see the transfudgifier
    return x


@row_wise
def ABSZ(index, x: float):
    # see the transfudgifier
    return x


@row_wise
def MAXABSZ(index, x: float):
    # see the transfudgifier
    return x


@row_wise
def SCALE(index, x: float):
    # see the transfudgifier
    return x


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL, 0)
def OFFSET(index, x, offset: int):
    # this is handled specially elsewhere
    return x


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL, [1, 2])
@levels([1, 2])
def IF(index, cond: int, x=1, y=-2147483648):
    if is_missing(cond, True):
        return -2147483648
    return x if cond else y


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL, [1, 2])
def IFMISS(index, cond, x=1, y=-2147483648):
    return x if is_missing(cond, empty_str_is_missing=True) else y


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL, 0)
def NOT(index, x):
    if is_missing(x):
        return x
    return 1 if not x else 0


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL, 0)
def FILTER(index, x, *conds: int):
    for cond in conds:
        if is_missing(cond, True):
            return -2147483648
        if not cond:
            return -2147483648
    return x


@row_wise
@returns(DataType.TEXT, MeasureType.NOMINAL)
def TEXT(index, x: str):
    return x


@row_wise
def VALUE(index, x: str):
    return float(x)


@row_wise
@returns(DataType.INTEGER, MeasureType.CONTINUOUS)
def INT(index, x):
    return int(float(x))


@row_wise
@returns(DataType.TEXT, MeasureType.NOMINAL)
def SPLIT(index, x: str, sep: str = ',', piece: int = -2147483648):
    pieces = x.split(sep)
    if piece == -2147483648:
        return ' '.join(pieces)
    elif piece <= 0:
        return ''
    else:
        return pieces[piece - 1]


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL, range(2, 10000, 2))
@levels(range(0, 10000, 2))
def RECODE(index, x, *args):
    for i in range(0, len(args) - 1, 2):
        cond = args[i]
        if not is_missing(cond) and cond:
            return args[i + 1]
    if len(args) % 2 == 1:
        return args[-1]
    else:
        return x


@row_wise
@returns(DataType.INTEGER, MeasureType.NOMINAL)
def CONTAINS(index, item1: str, in1: str, *args: str, in2: str = '', in3: str = '', in4: str = '', in5: str = '', in6: str = '', in7: str = '', in8: str = '', in9: str = ''):
    needles = [ item1, in1 ] + list(args)
    haystacks = [ in2, in3, in4, in5, in6, in7, in8, in9 ]
    first_haystack = needles.pop()
    haystacks.insert(0, first_haystack)
    for needle in needles:
        for haystack in haystacks:
            if needle in haystack:
                return 1
    else:
        return 0


_RECODE_NOM = RECODE
_RECODE_ORD = RECODE
_RECODE_CONT = RECODE
_RECODE_ID  = RECODE
