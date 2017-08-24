import statistics as stats
import random
import math

from itertools import chain

NaN = float('nan')


class RowFunctions:

    @staticmethod
    def MEAN(index, arg0: float, *args: float):
        values = [ arg0 ]
        values.extend(args)
        return stats.mean(values)

    @staticmethod
    def SUM(index, arg0: float, *args: float):
        values = [ arg0 ]
        values.extend(args)
        return math.fsum(values)

    @staticmethod
    def ABS(index, value: float):
        return math.fabs(value)

    @staticmethod
    def EXP(index, value: float):
        return math.exp(value)

    @staticmethod
    def LN(index, value: float):
        return math.log(value)

    @staticmethod
    def LOG10(index, value: float):
        return math.log10(value)

    @staticmethod
    def SQRT(index, value: float):
        return math.sqrt(value)

    @staticmethod
    def UNIF(index, a: float=0.0, b: float=1.0):
        return random.uniform(a, b)

    @staticmethod
    def NORM(index, mu: float=0.0, sd: float=1.0):
        return random.gauss(mu, sd)

    @staticmethod
    def BETA(index, alpha: float=1.0, beta: float=1.0):
        return random.betavariate(alpha, beta)

    @staticmethod
    def GAMMA(index, alpha: float=1.0, beta: float=1.0):
        return random.gammavariate(alpha, beta)


class ColumnFunctions:

    @staticmethod
    def VMEAN(arg0, *args):
        values = chain(arg0, *args)
        return stats.mean(values)

    @staticmethod
    def VSTDEV(arg0, *args):
        values = chain(arg0, *args)
        return stats.stdev(values)

    @staticmethod
    def VSE(arg0, *args):
        values = chain(arg0, *args)
        return stats.pstdev(values)

    @staticmethod
    def VVAR(arg0, *args):
        values = chain(arg0, *args)
        return stats.variance(values)

    @staticmethod
    def VMED(arg0, *args):
        values = chain(arg0, *args)
        return stats.median(values)

    @staticmethod
    def VMODE(arg0, *args):
        values = chain(arg0, *args)
        return stats.mode(values)

    @staticmethod
    def VSUM(arg0, *args):
        values = chain(arg0, *args)
        return math.fsum(values)

    @staticmethod
    def VROWS(arg0, *args):
        values = chain(arg0, *args)
        return sum(1 for _ in values)
