
import statistics as stats
import random

from itertools import chain


_ATLEAST_ONE = '{}() requires at least one variable'


class RowFunctions:

    @staticmethod
    def MEAN(index, *args):
        if len(args) == 0:
            raise TypeError(_ATLEAST_ONE.format('MEAN'))

        return stats.mean(args)

    @staticmethod
    def RAND(index, *args):
        return random.uniform(0, 1)

    @staticmethod
    def NORM(index, *args):
        mu = 0
        sd = 1
        if len(args) >= 1:
            mu = args[0]
        if len(args) >= 2:
            sd = args[1]
        return random.gauss(mu, sd)


class ColumnFunctions:

    @staticmethod
    def VMEAN(*args):
        if len(args) == 0:
            raise TypeError(_ATLEAST_ONE.format('VMEAN'))

        values = chain.from_iterable(args)
        return stats.mean(values)

    @staticmethod
    def VSTDEV(*args):
        if len(args) == 0:
            raise TypeError(_ATLEAST_ONE.format('SD'))
        values = chain.from_iterable(args)
        return stats.stdev(values)

    @staticmethod
    def VSE(*args):
        if len(args) == 0:
            raise TypeError(_ATLEAST_ONE.format('SE'))
        values = chain.from_iterable(args)
        return stats.pstdev(values)

    @staticmethod
    def VVAR(*args):
        if len(args) == 0:
            raise TypeError(_ATLEAST_ONE.format('VAR'))
        values = chain.from_iterable(args)
        return stats.variance(values)

    @staticmethod
    def VMED(*args):
        if len(args) == 0:
            raise TypeError(_ATLEAST_ONE.format('MED'))
        values = chain.from_iterable(args)
        return stats.median(values)

    @staticmethod
    def VMODE(*args):
        if len(args) == 0:
            raise TypeError(_ATLEAST_ONE.format('MODE'))
        values = chain.from_iterable(args)
        return stats.mode(values)
