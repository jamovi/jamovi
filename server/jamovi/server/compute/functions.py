
import statistics as stats
import random

from itertools import chain

NaN = float('nan')


class RowFunctions:

    @staticmethod
    def MEAN(index, *args):
        if len(args) == 0:
            return NaN
        return stats.mean(args)

    @staticmethod
    def RAND(index, *args):
        return random.uniform(0, 1)

    @staticmethod
    def NORM(index, mu=0, sd=1, *args):
        return random.gauss(mu, sd)


class ColumnFunctions:

    @staticmethod
    def VMEAN(*args):
        if len(args) == 0:
            return NaN
        values = chain.from_iterable(args)
        return stats.mean(values)

    @staticmethod
    def VSTDEV(*args):
        if len(args) == 0:
            return NaN
        values = chain.from_iterable(args)
        return stats.stdev(values)

    @staticmethod
    def VSE(*args):
        if len(args) == 0:
            return NaN
        values = chain.from_iterable(args)
        return stats.pstdev(values)

    @staticmethod
    def VVAR(*args):
        if len(args) == 0:
            return NaN
        values = chain.from_iterable(args)
        return stats.variance(values)

    @staticmethod
    def VMED(*args):
        if len(args) == 0:
            return NaN
        values = chain.from_iterable(args)
        return stats.median(values)

    @staticmethod
    def VMODE(*args):
        if len(args) == 0:
            return NaN
        values = chain.from_iterable(args)
        return stats.mode(values)
