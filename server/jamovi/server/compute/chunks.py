
# formulas are evaluated a chunk of rows at a time. a node's fchunk() gives
# the values of a chunk, either as a list of row values (as fvalue() gives
# them, with a RowError in place of a row that fails), or, from a vectorised
# node, as a Chunk of numeric arrays.
#
# how the evaluation fits together
# --------------------------------
#
# there are two evaluators: fvalue(), the original, which evaluates a row at
# a time in python, and fchunk(), which evaluates a chunk of rows
# (Computation.CHUNK_SIZE) at a time
#
# a node vectorises (Node.fchunk()) when its _can_vectorise() says so and it
# uses no random functions (their values depend on the order the rows are
# evaluated in). otherwise default_fchunk() evaluates it with fvalue(), a row
# at a time, and a vectorised node above it converts those values with
# as_chunk(). fvalue() is still used:
#
#   - for every node that doesn't vectorise: anything with text values,
#     levelled values into NOT() or INT(), and the functions that aren't in
#     Call.VECTORISED_FUNCTIONS (OFFSET, RANK, ROUND, TEXT, VALUE, SPLIT,
#     RECODE, MATCH, HLOOKUP, CONTAINS, DATE, IIQR, BOXCOX, ROW, the random
#     functions, ...), including the column-wise functions with a group_by
#     other than a levelled column (those use SplitValues, FValueConverter)
#   - for the rows a vectorised node can't be sure of (Node._patch()), such
#     as those with infinities, which numpy and python treat differently
#   - for whole chunks a vectorised node can't represent (NotVectorisable):
#     complex results, integers beyond int64, or integers and decimals mixed
#     where python would compare them differently
#   - by get_levels(), to find the levels a text result uses
#   - by the tests (tests/test_formulas.py), which compare fchunk() with
#     fvalue() on many formulas, including random ones


import math

import numpy as np

from .typevalues import convert


INT_MISSING = -2147483648


class RowError:
    """in place of the value of a row whose evaluation failed"""

    __slots__ = ('exception',)

    def __init__(self, exception):
        self.exception = exception


class NotVectorisable(Exception):
    """raised by a vectorised evaluation that can't represent a chunk's
    values, so the node falls back to evaluating it row by row"""


class Chunk:
    """a chunk of numeric values, as an array of integers (int64, missing as
    INT_MISSING) or decimals (float64, missing as NaN), with the rows whose
    evaluation failed"""

    __slots__ = ('values', 'errors')

    def __init__(self, values: np.ndarray, errors: np.ndarray | None = None):
        self.values = values
        self.errors = errors

    def __len__(self):
        return len(self.values)

    @property
    def is_float(self):
        return self.values.dtype == np.float64

    @property
    def missing(self) -> np.ndarray:
        if self.is_float:
            return np.isnan(self.values)
        else:
            return self.values == INT_MISSING

    def as_float(self) -> 'Chunk':
        if self.is_float:
            return self
        values = self.values.astype(np.float64)
        values[self.values == INT_MISSING] = np.nan
        return Chunk(values, self.errors)

    def as_int(self) -> 'Chunk':
        # as convert(): truncated, with NaN and infinities missing
        if not self.is_float:
            return self
        values = self.values
        finite = np.isfinite(values)
        if np.any(np.abs(values[finite]) >= 2 ** 63):
            raise NotVectorisable()
        ints = np.full(len(values), INT_MISSING, dtype=np.int64)
        ints[finite] = np.trunc(values[finite]).astype(np.int64)
        return Chunk(ints, self.errors)

    def to_list(self) -> list:
        values = self.values.tolist()
        if self.errors is not None:
            for i in np.flatnonzero(self.errors).tolist():
                values[i] = RowError(None)
        return values


def default_fchunk(node, start, end, row_count, filt) -> list:
    """the values of rows start to end, a row at a time with fvalue()"""
    values = [ None ] * (end - start)
    for i in range(start, end):
        try:
            values[i - start] = node.fvalue(i, row_count, filt)
        except Exception as e:
            values[i - start] = RowError(e)
    return values


def to_list(values: list | Chunk) -> list:
    if isinstance(values, Chunk):
        return values.to_list()
    return values


def convert_chunk(values: list | Chunk, to_type) -> list:
    """convert a chunk's values to a column's type (as convert() does each
    row's), leaving the RowErrors in place"""
    if isinstance(values, Chunk):
        array = values.values
        errors = values.errors
        if to_type is float:
            if not values.is_float:
                missing = array == INT_MISSING
                array = array.astype(np.float64)
                array[missing] = np.nan
            values = array.tolist()
        elif to_type is int and not values.is_float:
            values = array.tolist()
        else:
            values = [ convert(v, to_type) for v in array.tolist() ]
        if errors is not None:
            for i in np.flatnonzero(errors).tolist():
                values[i] = RowError(None)
        return values
    else:
        return [ v if isinstance(v, RowError) else convert(v, to_type) for v in values ]


def _from_list(values: list, to_type) -> Chunk:
    # a default node's row values as a Chunk: levels by their raw value, and
    # anything other than numbers and missing values isn't vectorisable
    n = len(values)
    out = [ None ] * n
    errors = None
    has_int = False
    has_float = False
    for i, v in enumerate(values):
        t = type(v)
        if t is tuple:
            v = v[0]
            t = type(v)
        if t is float:
            if v == v:
                has_float = True
                out[i] = v
        elif t is int or t is bool:
            if v != INT_MISSING:
                has_int = True
                out[i] = v
        elif t is RowError:
            if errors is None:
                errors = np.zeros(n, dtype=bool)
            errors[i] = True
        else:
            raise NotVectorisable()

    if to_type is None:
        if has_int and has_float:
            raise NotVectorisable()  # python's comparisons differ by type
        to_type = float if has_float else int

    try:
        if to_type is float:
            array = np.array([ math.nan if v is None else v for v in out ], dtype=np.float64)
        else:
            out = [ INT_MISSING if v is None else convert(v, int) for v in out ]
            array = np.array(out, dtype=np.int64)
    except OverflowError:
        raise NotVectorisable()

    return Chunk(array, errors)


def as_chunk(values: list | Chunk, to_type=None) -> Chunk:
    """a node's chunk as a Chunk, converted to to_type (int or float) as
    convert() converts each row's value; with no to_type, integers and
    decimals stay as they are"""
    if not isinstance(values, Chunk):
        return _from_list(values, to_type)
    if to_type is float:
        return values.as_float()
    elif to_type is int:
        return values.as_int()
    else:
        return values


def any_errors(*chunks: Chunk) -> np.ndarray | None:
    """the rows that failed in any of the chunks"""
    errors = None
    for chunk in chunks:
        if chunk.errors is not None:
            if errors is None:
                errors = chunk.errors.copy()
            else:
                errors |= chunk.errors
    return errors
