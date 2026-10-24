

import ast
from inspect import signature
from inspect import Parameter
from types import FunctionType as function
import math
from collections import OrderedDict
from numbers import Number
from itertools import compress

import numpy as np

from jamovi.server.dataset.enums import DataType
from jamovi.server.dataset.enums import MeasureType
from . import FValues
from . import convert
from . import is_missing
from . import get_missing
from . import is_equal
from . import functions
from . import vcolumnwise
from .chunks import default_fchunk
from .chunks import Chunk
from .chunks import NotVectorisable
from .chunks import INT_MISSING
from .chunks import as_chunk
from .chunks import any_errors
from .chunks import to_list
from ..i18n import _

NaN = float('nan')

# column-wise functions evaluate their input this many rows at a time
COLUMN_INPUT_CHUNK = 100_000

# these draw a random number for each row, in row order
RANDOM_FUNCTIONS = { 'UNIF', 'NORM', 'BETA', 'GAMMA', 'SAMPLE' }


class FValueConverter:

    def __init__(self, fvalues, arg_type):
        self._fvalues = fvalues
        self._arg_type = arg_type

    def __iter__(self):
        return FValueConverter.Iter(self._fvalues.__iter__(), self._arg_type)

    class Iter:
        def __init__(self, fiter, arg_type):
            self._fiter = fiter
            self._arg_type = arg_type

        def __next__(self):
            value = self._fiter.__next__()
            value = convert(value, self._arg_type)
            return value


class SplitValues:
    def __init__(self, split_by, func, args, kwargs):
        self._split_by = split_by
        self._func = func
        self._cache = None
        self._args = args
        self._kwargs = kwargs

    def _calculate(self, row_count, filt):

        if self._split_by is None:
            args = self._args
            kwargs = self._kwargs
            self._cache = self._func(*args, **kwargs)
        else:
            self._cache = { }

            if self._split_by.has_levels:
                levels = self._split_by.get_levels(row_count, filt)
            else:
                levels = set(self._split_by.fvalues(row_count, filt))

            for level in levels:

                def keep_only_this_level(values):
                    return compress(values, map(lambda x: is_equal(x, level), self._split_by.fvalues(row_count, filt)))

                args = map(keep_only_this_level, self._args)
                kwargs = { k: keep_only_this_level(v) for k, v in self._kwargs }
                key = convert(level, str)
                try:
                    value = self._func(*args, **kwargs)
                except Exception:
                    value = (-2147483648, '')
                self._cache[key] = value

    def fvalue(self, index, row_count, filt):
        if self._cache is None:
            self._calculate(row_count, filt)

        if self._split_by is None:
            if isinstance(self._cache, list):
                return self._cache[index]
            else:
                return self._cache
        else:
            value = self._split_by.fvalue(index, row_count, filt)
            if is_missing(value):
                return (-2147483648, '')
            else:
                return self._cache[convert(value, str)]


class Node:
    def __init__(self):
        self._node_parents = [ ]
        self._deleted = False

    def set_needs_recalc(self):
        for parent in self._node_parents:
            parent.set_needs_recalc()

    def set_needs_parse(self):
        for parent in self._node_parents:
            parent.set_needs_parse()

    @property
    def needs_recalc(self):
        return False

    def fvalues(self, row_count, filt):
        return FValues(self, row_count, filt)

    def fchunk(self, start, end, row_count, filt):
        # the values of rows start to end (see chunks.py). vectorised nodes
        # implement _vchunk(), and evaluate a row at a time when they can't
        # (or when random functions would draw in a different order). see
        # the comment at the top of chunks.py for how this fits together
        if self._can_vectorise() and not self._uses_random():
            try:
                return self._vchunk(start, end, row_count, filt)
            except NotVectorisable:
                pass
        return default_fchunk(self, start, end, row_count, filt)

    def _can_vectorise(self):
        return False

    def _vchunk(self, start, end, row_count, filt):
        raise NotVectorisable()

    def _gives_plain_values(self, filt):
        # whether fvalue() gives only numbers (or text), never a level's
        # (value, label), nor a missing level (-2147483648, ''). most
        # vectorised nodes treat these as their value; NOT() and INT() don't
        return False

    def _uses_random(self):
        for node in ast.walk(self):
            if isinstance(node, Call) and node._function.__name__ in RANDOM_FUNCTIONS:
                return True
        return False

    def _patch(self, chunk: Chunk, rows, start, row_count, filt):
        # evaluate rows (indices into the chunk) a row at a time, for those a
        # vectorised evaluation can't be sure of
        values = chunk.values
        for i in rows.tolist():
            try:
                v = self.fvalue(start + i, row_count, filt)
            except Exception:
                if chunk.errors is None:
                    chunk.errors = np.zeros(len(values), dtype=bool)
                chunk.errors[i] = True
                continue
            if isinstance(v, tuple):
                v = v[0]
            t = type(v)
            if chunk.is_float and (t is float or t is int or t is bool):
                values[i] = np.nan if t is int and v == INT_MISSING else v
            elif not chunk.is_float and (t is int or t is bool):
                values[i] = v
            else:
                raise NotVectorisable()
        return chunk

    @property
    def has_levels(self):
        return False

    @property
    def uses_column_formula(self):
        return False

    def is_atomic_node(self):
        return True

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        if node in self._node_parents:
            self._node_parents.remove(node)
        if len(self._node_parents) == 0:
            self.delete()

    def delete(self):
        if not self._deleted:
            self._delete()
            self._deleted = True

    def _delete(self):
        pass


class Constant(ast.Constant, Node):

    def __init__(self, *args, **kwargs):
        ast.Constant.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        return self.value

    def _can_vectorise(self):
        t = type(self.value)
        return t is int or t is bool or t is float

    def _gives_plain_values(self, filt):
        return True

    def _vchunk(self, start, end, row_count, filt):
        if type(self.value) is float:
            return Chunk(np.full(end - start, self.value, dtype=np.float64))
        try:
            return Chunk(np.full(end - start, self.value, dtype=np.int64))
        except OverflowError:
            raise NotVectorisable()

    def is_atomic_node(self):
        return True

    @property
    def data_type(self):
        if isinstance(self.value, str):
            return DataType.TEXT
        elif isinstance(self.value, int):
            return DataType.INTEGER
        else:
            return DataType.DECIMAL

    @property
    def measure_type(self):
        if isinstance(self.value, str):
            return MeasureType.NOMINAL
        elif isinstance(self.value, int):
            return MeasureType.ORDINAL
        else:
            return MeasureType.CONTINUOUS

    @property
    def has_levels(self):
        return isinstance(self.value, str)

    def get_levels(self, row_count, filt):
        return [ (0, self.value) ]

    @property
    def uses_column_formula(self):
        return False


class UnaryOp(ast.UnaryOp, Node):

    def __init__(self, *args, **kwargs):
        ast.UnaryOp.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        op = self.op
        v = self.operand.fvalue(index, row_count, filt)
        if isinstance(op, ast.USub):
            if is_missing(v):
                return v
            elif isinstance(v, tuple):
                v = v[0]
            return -v
        elif isinstance(op, ast.UAdd):
            if is_missing(v):
                return v
            elif isinstance(v, tuple):
                v = v[0]
            elif isinstance(v, str):
                v = float(v)
            return v
        elif isinstance(op, ast.Not):
            if is_missing(v):
                return v
            elif isinstance(v, tuple):
                v = v[0]
            return 1 if not v else 0
        elif isinstance(op, ast.Invert):
            if is_missing(v):
                return 0
            else:
                return v
        else:
            raise RuntimeError("Shouldn't get here")

    def _can_vectorise(self):
        return (isinstance(self.op, (ast.USub, ast.UAdd, ast.Not))
                and self.operand.data_type is not DataType.TEXT)

    def _vchunk(self, start, end, row_count, filt):
        operand = as_chunk(self.operand.fchunk(start, end, row_count, filt))
        values = operand.values
        missing = operand.missing
        if isinstance(self.op, ast.USub):
            values = np.where(missing, values, -values)
        elif isinstance(self.op, ast.Not):
            values = np.where(missing, INT_MISSING, values == 0).astype(np.int64)
        return Chunk(values, operand.errors)

    def _gives_plain_values(self, filt):
        return self.operand._gives_plain_values(filt)

    def is_atomic_node(self):
        return self.operand.is_atomic_node()

    @property
    def data_type(self):
        if isinstance(self.op, ast.UAdd):
            if self.operand.data_type is DataType.TEXT:
                return DataType.DECIMAL
            else:
                return self.operand.data_type
        elif isinstance(self.op, ast.Not):
            return DataType.INTEGER
        else:
            return self.operand.data_type

    @property
    def measure_type(self):
        if isinstance(self.op, ast.UAdd):
            if self.operand.data_type is DataType.TEXT:
                return MeasureType.CONTINUOUS
            else:
                return self.operand.measure_type
        elif isinstance(self.op, ast.Not):
            return MeasureType.NOMINAL
        else:
            return self.operand.measure_type

    @property
    def has_levels(self):
        return False

    @property
    def uses_column_formula(self):
        return self.operand.uses_column_formula

    def _delete(self):
        self.operand._remove_node_parent(self)


class BoolOp(ast.BoolOp, Node):

    def __init__(self, *args, **kwargs):
        ast.BoolOp.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        if isinstance(self.op, ast.And):
            to_return = 1
            for v in self.values:
                value = v.fvalue(index, row_count, filt)
                if is_missing(value):
                    to_return = value
                    continue
                if isinstance(value, tuple):
                    value = value[0]
                if not value:
                    return 0
            return to_return
        elif isinstance(self.op, ast.Or):
            to_return = 0
            for v in self.values:
                value = v.fvalue(index, row_count, filt)
                if is_missing(value):
                    to_return = value
                    continue
                if isinstance(value, tuple):
                    value = value[0]
                if value:
                    return 1
            return to_return
        else:
            raise RuntimeError("Shouldn't get here")

    def _can_vectorise(self):
        for v in self.values:
            if v.data_type is DataType.TEXT:
                return False
        return True

    def _vchunk(self, start, end, row_count, filt):
        # and: 0 at the first false value (later values aren't evaluated for
        # that row), otherwise missing if any value is missing, otherwise 1.
        # or: the same, with true and false the other way round
        is_and = isinstance(self.op, ast.And)
        n = end - start
        undecided = np.ones(n, dtype=bool)
        any_missing = np.zeros(n, dtype=bool)
        errors = np.zeros(n, dtype=bool)
        result = np.full(n, 1 if is_and else 0, dtype=np.int64)
        for v in self.values:
            chunk = as_chunk(v.fchunk(start, end, row_count, filt))
            if chunk.errors is not None:
                failed = chunk.errors & undecided
                errors |= failed
                undecided &= ~failed
            missing = chunk.missing
            any_missing |= missing & undecided
            if is_and:
                decides = (chunk.values == 0) & ~missing & undecided
            else:
                decides = (chunk.values != 0) & ~missing & undecided
            result[decides] = 0 if is_and else 1
            undecided &= ~decides
        result[undecided & any_missing] = INT_MISSING
        return Chunk(result, errors if errors.any() else None)

    def _gives_plain_values(self, filt):
        for v in self.values:
            if not v._gives_plain_values(filt):
                return False
        return True

    def is_atomic_node(self):
        for value in self.values:
            if not value.is_atomic_node():
                return False
        return True

    @property
    def data_type(self):
        return DataType.INTEGER

    @property
    def measure_type(self):
        return MeasureType.NOMINAL

    @property
    def has_levels(self):
        return False

    @property
    def uses_column_formula(self):
        for v in self.values:
            if v.uses_column_formula:
                return True
        return False

    def _delete(self):
        for v in self.values:
            v._remove_node_parent(self)


class Call(ast.Call, Node):

    def __init__(self, func, args, keywords):
        Node.__init__(self)
        self._cached_value = None
        self._cached_column = None  # the vectorised column-wise values
        self._arg_types = [ ]
        self._kw_types = [ ]
        self._d_type = None
        self._m_type = None

        name = func.id

        if not hasattr(functions, name):
            raise NameError(_('Function {}() does not exist').format(name))

        self._function = getattr(functions, name)

        # the following checks and substitutes sub-functions
        # see BOXCOX() or Z() for an example of a function
        # with sub-functions

        params = signature(self._function).parameters
        param_names = list(params)
        if self._function.meta.is_row_wise:
            param_names.pop(0)

        for param_name in param_names:
            param = params[param_name]
            annot = param.annotation
            if annot is Parameter.empty:
                annot = None
            if param.kind is Parameter.KEYWORD_ONLY:
                self._kw_types.append(annot)
            else:
                self._arg_types.append(annot)

        sub_arg_len = len(param_names)
        for param_name in reversed(param_names):
            if isinstance(params[param_name].default, function):
                sub_arg_len -= 1
            else:
                break
        sub_func_args = args[0:sub_arg_len]  # arguments to the sub-functions

        for i in range(sub_arg_len, len(param_names)):
            # add the sub-functions as arguments if not specified by the user
            if len(args) <= i:
                sub_func = params[param_names[i]].default
                sub_func_name = sub_func.__name__
                new_func = Call(ast.Name(id=sub_func_name), sub_func_args, keywords)
                for sf_arg in sub_func_args:
                    sf_arg._add_node_parent(new_func)
                args.append(new_func)
            else:
                break

        ast.Call.__init__(self, func, args, keywords)

    def fvalue(self, index, row_count, filt):
        if self._function.__name__ == 'OFFSET':
            offset = convert(self.args[1].fvalue(index, row_count, False), int)
            dest_index = index - offset
            if 0 <= dest_index < row_count:
                value = self.args[0].fvalue(dest_index, row_count, False)
            else:
                value = NaN
        elif self._function.meta.is_column_wise:
            if self._cached_value is None:
                group_by = None
                args = list(self.args)
                for i in range(len(args)):
                    arg = args[i]
                    if i == 1 and self._function.meta.has_group_by:
                        group_by = arg.fvalues(row_count, filt)
                    else:
                        arg_type_i = min(i, len(self._arg_types) - 1)
                        arg_type = self._arg_types[arg_type_i]
                        args[i] = FValueConverter(arg.fvalues(row_count, filt), arg_type)
                if group_by is not None:
                    args.pop(1)
                kwargs = {}
                for i, kwarg in enumerate(self.keywords):
                    kw_name = kwarg.arg
                    if kw_name == 'group_by':
                        group_by = kwarg.value
                    else:
                        kw_values = kwarg.value.fvalues(row_count, filt)
                        kw_type = self._kw_types[i]
                        kw_values = FValueConverter(kw_values, kw_type)
                        kwargs[kw_name] = kw_values
                self._cached_value = SplitValues(group_by, self._function, args, kwargs)
            value = self._cached_value.fvalue(index, row_count, filt)
        else:
            args = list(map(lambda arg: arg.fvalue(index, row_count, filt), self.args))
            for i in range(len(args)):
                arg_type_i = min(i, len(self._arg_types) - 1)
                arg_type = self._arg_types[arg_type_i]
                args[i] = convert(args[i], arg_type)
            kwargs = {}
            for i, kwarg in enumerate(self.keywords):
                kw_name = kwarg.arg
                kw_value = kwarg.fvalue(index, row_count, filt)
                kw_type = self._kw_types[i]
                kw_value = convert(kw_value, kw_type)
                kwargs[kw_name] = kw_value
            value = self._function(index, *args, **kwargs)

        return value

    # vectorised row-wise functions (see _v_IF() etc.), and their keywords
    VECTORISED_FUNCTIONS = {
        'IF': (), 'IFMISS': (), 'NOT': (), '_FILTER': (),
        'ABS': (), 'FLOOR': (), 'CEILING': (), 'EXP': (), 'LN': (), 'LOG10': (),
        'SQRT': (), 'INT': (), 'MAX': (), 'MIN': (), 'COUNT': (),
        'MEAN': ('ignore_missing', 'min_valid'), 'SUM': ('ignore_missing', 'min_valid'),
        'STDEV': ('ignore_missing',), 'VAR': ('ignore_missing',),
    }

    # these give a number (or missing) for each row, never one of their
    # arguments as it is
    NUMERIC_FUNCTIONS = {
        '_FILTER', 'ABS', 'FLOOR', 'CEILING', 'EXP', 'LN', 'LOG10', 'SQRT', 'INT',
        'MAX', 'MIN', 'COUNT', 'MEAN', 'SUM', 'STDEV', 'VAR', 'ROUND', 'ROW',
    }

    def _can_vectorise(self):
        name = self._function.__name__
        if self._function.meta.is_column_wise:
            return self._can_vectorise_column_wise()
        if name not in Call.VECTORISED_FUNCTIONS or self.data_type is DataType.TEXT:
            return False
        for arg in self.args:
            if arg.data_type is DataType.TEXT:
                return False
        keywords = Call.VECTORISED_FUNCTIONS[name]
        for kw in self.keywords:
            if kw.arg not in keywords or not isinstance(kw.value, Constant):
                return False
        return True

    def _gives_plain_values(self, filt):
        name = self._function.__name__
        if name in Call.NUMERIC_FUNCTIONS:
            return True
        elif name == 'NOT':
            return self.args[0]._gives_plain_values(filt)
        elif name == 'IF' or name == 'IFMISS':
            for arg in self.args[1:]:
                if not arg._gives_plain_values(filt):
                    return False
            return True
        else:
            return False

    def _can_vectorise_column_wise(self):
        # one argument, and group_by only as a keyword, naming a column with
        # levels (as Z() and SCALE() have it). other group_bys keep the
        # default, as do positional ones (which fail)
        if self._function.__name__ not in vcolumnwise.FUNCTIONS:
            return False
        if len(self.args) != 1 or self.args[0].data_type is DataType.TEXT:
            return False
        for kw in self.keywords:
            if kw.arg != 'group_by':
                return False
            group_by = kw.value
            if not hasattr(group_by, 'read_chunk') or group_by.is_virtual or not group_by.has_levels:
                return False
        return True

    def _vchunk_column_wise(self, start, end, row_count, filt):
        # the whole column is evaluated once (in the first chunk), and kept
        # for the others, until the next recalc
        if self._cached_column is None:
            self._cached_column = self._column_wise_values(row_count, filt)
        values, errors = self._cached_column
        if errors is not None:
            errors = errors[start:end].copy()
        if isinstance(values, np.ndarray):
            return Chunk(values[start:end].copy(), errors)
        dtype = np.int64 if self.data_type is DataType.INTEGER else np.float64
        return Chunk(np.full(end - start, values, dtype=dtype), errors)

    @staticmethod
    def _column_input(node, row_count, filt):
        # a column-wise function's input as decimals, as FValueConverter
        # gives them (rows that fail are missing)
        if hasattr(node, 'fchunk_whole'):  # a column, read once a recalc
            return as_chunk(node.fchunk_whole(row_count, filt), float).values
        parts = [ ]
        for start in range(0, row_count, COLUMN_INPUT_CHUNK):
            end = min(start + COLUMN_INPUT_CHUNK, row_count)
            chunk = as_chunk(node.fchunk(start, end, row_count, filt), float)
            values = chunk.values
            if chunk.errors is not None:
                values = values.copy()
                values[chunk.errors] = np.nan
            parts.append(values)
        if len(parts) == 0:
            return np.zeros(0, dtype=np.float64)
        return np.concatenate(parts)

    def _column_wise_values(self, row_count, filt):
        # each row's value (or one value for every row), and the rows that
        # fail, as SplitValues has them
        func = vcolumnwise.FUNCTIONS[self._function.__name__]
        dtype = np.int64 if self.data_type is DataType.INTEGER else np.float64
        missing = INT_MISSING if dtype is np.int64 else np.nan

        x = Call._column_input(self.args[0], row_count, filt)

        group_by = None
        for kw in self.keywords:
            group_by = kw.value

        if group_by is None:
            try:
                value = func(x)
            except Exception:
                # every row fails
                return np.full(row_count, missing, dtype=dtype), np.ones(row_count, dtype=bool)
            return value, None

        # rows are in a level's group if they have its value (integers) or
        # its label (text); its function value is kept by its label, and each
        # row has the value of its own label (missing if its level is missing,
        # failing if its label has no level)
        levels = group_by.get_levels(row_count, filt)
        keys = [ ]  # the labels, in order
        key_index = { }
        for level in levels:
            if level[1] not in key_index:
                key_index[level[1]] = len(keys)
                keys.append(level[1])

        group_values = to_list(group_by.fchunk_whole(row_count, filt))

        # each row's label index (-2 missing, -1 a label with no level)
        if group_by.data_type is DataType.TEXT:
            members = np.array([ v if type(v) is str else None for v in group_values ], dtype=object)
            codes = np.array([
                key_index.get(v, -1) if type(v) is str else -2
                for v in group_values ], dtype=np.int64)
        else:
            raws = np.array(group_values, dtype=np.int64)
            members = raws
            labels = { level[0]: level[1] for level in levels }
            codes = np.full(row_count, -2, dtype=np.int64)
            for raw in np.unique(raws[raws != INT_MISSING]).tolist():
                if raw not in labels:
                    raise NotVectorisable()  # get_label() of a value with no level
                codes[raws == raw] = key_index[labels[raw]]

        by_key = np.full(len(keys) + 2, missing, dtype=dtype)
        for level in levels:
            if group_by.data_type is DataType.TEXT:
                mask = members == level[1]
            else:
                mask = members == level[0]
            try:
                value = func(x[mask])
            except Exception:
                value = missing
            by_key[key_index[level[1]]] = value

        values = by_key[codes]  # -1 and -2 index the two missing values at the end
        errors = codes == -1
        return values, (errors if errors.any() else None)

    def _vchunk(self, start, end, row_count, filt):
        if self._function.meta.is_column_wise:
            return self._vchunk_column_wise(start, end, row_count, filt)
        name = self._function.__name__
        if name in ('NOT', 'INT') and not self.args[0]._gives_plain_values(filt):
            raise NotVectorisable()
        # each argument's chunk, converted to its parameter's type as
        # fvalue() converts each row's (untyped parameters as they are)
        args = [ ]
        for i, arg in enumerate(self.args):
            arg_type = self._arg_types[min(i, len(self._arg_types) - 1)]
            if arg_type is not int and arg_type is not float:
                arg_type = None
            args.append(as_chunk(arg.fchunk(start, end, row_count, filt), arg_type))
        kwargs = { kw.arg: convert(kw.value.value, int) for kw in self.keywords }
        n = end - start
        chunk = getattr(self, '_v_' + name)(n, *args, **kwargs)
        if not isinstance(chunk, Chunk):
            chunk = Chunk(chunk)
        errors = any_errors(chunk, *args)
        chunk.errors = errors
        # infinities in, as python has them
        unsure = np.zeros(n, dtype=bool)
        for arg in args:
            if arg.is_float:
                unsure |= np.isinf(arg.values)
        if unsure.any():
            self._patch(chunk, np.flatnonzero(unsure), start, row_count, filt)
        return chunk

    @staticmethod
    def _choose(n, cond, x, y):
        # x where cond, y elsewhere; with x and y of different types, as
        # decimals, unless an integer is big enough that comparing it as a
        # decimal (isclose()) could differ from comparing it as an integer
        x = x.values if x is not None else np.ones(n, dtype=np.int64)
        y = y.values if y is not None else np.full(n, INT_MISSING, dtype=np.int64)
        if x.dtype != y.dtype:
            for ints in (x, y):
                if ints.dtype == np.int64:
                    present = ints[ints != INT_MISSING]
                    if len(present) > 0 and np.max(np.abs(present)) >= 1e8:
                        raise NotVectorisable()
            x = Chunk(x).as_float().values
            y = Chunk(y).as_float().values
        return np.where(cond, x, y)

    @staticmethod
    def _set_missing(values, missing):
        values[missing] = np.nan if values.dtype == np.float64 else INT_MISSING
        return values

    @staticmethod
    def _check_int32(values):
        # python's integers don't overflow
        present = values[values != INT_MISSING]
        if len(present) > 0 and np.max(np.abs(present)) > 2 ** 31 - 1:
            raise NotVectorisable()
        return values

    def _v_IF(self, n, cond, x=None, y=None):
        values = Call._choose(n, cond.values != 0, x, y)
        return Call._set_missing(values, cond.missing)

    def _v_IFMISS(self, n, cond, x=None, y=None):
        return Call._choose(n, cond.missing, x, y)

    def _v_NOT(self, n, x):
        return np.where(x.missing, INT_MISSING, x.values == 0).astype(np.int64)

    def _v__FILTER(self, n, cond):
        return np.where(cond.missing, 0, cond.values)

    # maths

    def _v_ABS(self, n, x):
        return np.abs(x.values) if x.is_float else np.where(x.missing, INT_MISSING, np.abs(x.values))

    def _v_FLOOR(self, n, x):
        if not x.is_float:
            return x.values
        missing = x.missing
        values = np.floor(np.where(missing, 0, x.values)).astype(np.int64)
        return Call._check_int32(Call._set_missing(values, missing))

    def _v_CEILING(self, n, x):
        if not x.is_float:
            return x.values
        missing = x.missing
        values = np.ceil(np.where(missing, 0, x.values)).astype(np.int64)
        return Call._check_int32(Call._set_missing(values, missing))

    def _v_INT(self, n, x):
        x = x.as_float()
        values = Call._check_int32(x.as_int().values)
        return values

    def _v_EXP(self, n, x):
        with np.errstate(all='ignore'):
            values = np.exp(x.values)
        errors = np.isfinite(x.values) & np.isinf(values)  # OverflowError
        return Chunk(values, errors)

    def _log(self, x, log):
        # math.log() fails for 0 and below (ValueError)
        errors = x.values <= 0
        with np.errstate(all='ignore'):
            values = log(np.where(errors, 1.0, x.values))
        return Chunk(values, errors)

    def _v_LN(self, n, x):
        return self._log(x, np.log)

    def _v_LOG10(self, n, x):
        return self._log(x, np.log10)

    def _v_SQRT(self, n, x):
        errors = x.values < 0
        values = np.sqrt(np.where(errors, 0.0, x.values))
        return Chunk(values, errors)

    # across arguments

    @staticmethod
    def _stack(args):
        return np.vstack([ arg.as_float().values for arg in args ])

    def _v_MAX(self, n, *args):
        values = Call._stack(args)
        missing = np.isnan(values)
        errors = np.all(missing, axis=0)  # max() of nothing
        values = np.max(np.where(missing, -np.inf, values), axis=0)
        return Chunk(Call._set_missing(values, errors), errors)

    def _v_MIN(self, n, *args):
        values = Call._stack(args)
        missing = np.isnan(values)
        errors = np.all(missing, axis=0)  # min() of nothing
        values = np.min(np.where(missing, np.inf, values), axis=0)
        return Chunk(Call._set_missing(values, errors), errors)

    def _v_COUNT(self, n, *args):
        if len(args) == 0:
            return np.zeros(n, dtype=np.int64)
        return np.sum(np.vstack([ ~arg.missing for arg in args ]), axis=0).astype(np.int64)

    @staticmethod
    def _valid(args, filter_missing):
        # the values, which are missing (and left out if filter_missing),
        # and how many values each row has
        values = Call._stack(args)
        missing = np.isnan(values)
        if filter_missing:
            counts = np.sum(~missing, axis=0)
        else:
            counts = np.full(values.shape[1], values.shape[0])
        return values, missing, counts

    def _v_MEAN(self, n, *args, ignore_missing=0, min_valid=0):
        filter_missing = min_valid > 0 or ignore_missing != 0
        values, missing, counts = Call._valid(args, filter_missing)
        with np.errstate(all='ignore'):
            if filter_missing:
                means = np.sum(np.where(missing, 0.0, values), axis=0) / counts
            else:
                means = np.sum(values, axis=0) / counts  # NaN if any are
        too_few = counts < min_valid
        errors = (counts == 0) & ~too_few  # mean() of nothing
        means[too_few | errors] = np.nan
        return Chunk(means, errors)

    def _v_SUM(self, n, *args, ignore_missing=0, min_valid=0):
        filter_missing = min_valid > 0 or ignore_missing != 0
        values, missing, counts = Call._valid(args, filter_missing)
        if filter_missing:
            sums = np.sum(np.where(missing, 0.0, values), axis=0)
        else:
            sums = np.sum(values, axis=0)
        sums[counts < min_valid] = np.nan
        return sums

    @staticmethod
    def _variance(values, missing, counts):
        # about the first value, so rows of equal values are exactly 0
        values = np.where(missing, 0.0, values)
        first = values[np.argmax(~missing, axis=0), np.arange(values.shape[1])]
        with np.errstate(all='ignore'):
            deviations = np.where(missing, 0.0, values - first)
            mean = np.sum(deviations, axis=0) / counts
            squares = np.where(missing, 0.0, (deviations - mean) ** 2)
            return np.sum(squares, axis=0) / (counts - 1)

    def _v_VAR(self, n, *args, ignore_missing=0):
        values, missing, counts = Call._valid(args, ignore_missing != 0)
        variances = Call._variance(values, missing, counts)
        errors = counts < 2  # variance() of fewer than two
        if ignore_missing == 0:
            variances[np.any(missing, axis=0)] = np.nan
        variances[errors] = np.nan
        return Chunk(variances, errors)

    def _v_STDEV(self, n, *args, ignore_missing=0):
        values, missing, counts = Call._valid(args, ignore_missing != 0)
        with np.errstate(all='ignore'):
            stdevs = np.sqrt(Call._variance(values, missing, counts))
        errors = counts < 2  # stdev() of fewer than two
        if ignore_missing == 0:
            errors |= np.any(missing, axis=0)  # stdev() fails with NaN
        stdevs[errors] = np.nan
        return Chunk(stdevs, errors)

    def is_atomic_node(self):
        return False

    @property
    def needs_recalc(self):
        return self._cached_value is None

    def set_needs_recalc(self):
        self._cached_value = None
        self._cached_column = None
        Node.set_needs_recalc(self)

    def _determine_d_m_types(self):
        # determine the data and measure type from the function meta
        # and the function arguments

        func_meta = self._function.meta

        if len(self.args) == 0:
            self._d_type = func_meta.d_type
            self._m_type = func_meta.m_type
            return

        if len(func_meta.returns) == 0:
            self._d_type = func_meta.d_type
            self._m_type = func_meta.m_type
            return

        # not sure why this doesn't work:
        # types = map(lambda i: args[i].measure_type, self._returns)
        #
        # had to do this instead:
        d_types = [None] * len(func_meta.returns)
        m_types = [None] * len(func_meta.returns)
        for i in range(len(func_meta.returns)):
            arg_i = func_meta.returns[i]
            if arg_i < len(self.args):
                d_types[i] = self.args[arg_i].data_type
                m_types[i] = self.args[arg_i].measure_type

        dt = DataType.INTEGER
        for t in list(d_types):
            if t is DataType.DECIMAL:
                dt = DataType.DECIMAL
            elif t is DataType.TEXT:
                dt = DataType.TEXT
                break

        if self.func.id == '_RECODE_CONT':
            if dt == DataType.TEXT:
                dt = DataType.DECIMAL
            mt = MeasureType.CONTINUOUS
        elif self.func.id == '_RECODE_NOM':
            if dt == DataType.DECIMAL:
                dt = DataType.TEXT
            mt = MeasureType.NOMINAL
        elif self.func.id == '_RECODE_ORD':
            if dt == DataType.DECIMAL:
                dt = DataType.TEXT
            mt = MeasureType.ORDINAL
        elif self.func.id == '_RECODE_ID':
            if dt == DataType.DECIMAL:
                dt = DataType.TEXT
            mt = MeasureType.ID
        elif dt is DataType.DECIMAL:
            mt = MeasureType.CONTINUOUS
        elif self.func.id == 'RECODE':
            # special handling for RECODE
            source = self.args[0]
            if dt is DataType.TEXT and source.measure_type is MeasureType.CONTINUOUS:
                mt = MeasureType.ORDINAL
            else:
                mt = source.measure_type
        elif MeasureType.ID in m_types:
            mt = MeasureType.ID
        elif MeasureType.ORDINAL in m_types:
            mt = MeasureType.ORDINAL
        else:
            mt = MeasureType.NOMINAL

        self._d_type = dt
        self._m_type = mt

    @property
    def data_type(self):
        if self._d_type is None:
            self._determine_d_m_types()
        return self._d_type

    @property
    def measure_type(self):
        if self._m_type is None:
            self._determine_d_m_types()
        return self._m_type

    @property
    def has_levels(self):
        return True

    def get_levels(self, row_count, filt):

        func_meta = self._function.meta
        arg_level_indices = func_meta.arg_level_indices

        if len(arg_level_indices) == 0:
            return [ ]
        if len(self.args) == 0:
            return [ ]
        if self.data_type is not DataType.TEXT:
            return [ ]
        if self.measure_type is MeasureType.ID:
            return [ ]

        source = self.args[0]
        if ((self.func.id == '_RECODE_ORD' or self.func.id == '_RECODE_NOM')
                and source.measure_type == MeasureType.CONTINUOUS):
            levels = self.fvalues(row_count, False)
            levels = filter(lambda x: not is_missing(x), levels)
            levels = sorted(levels)
            levels = map(lambda x: convert(x, str), levels)
            return enumerate(levels)

        level_use = OrderedDict()

        for i in range(len(arg_level_indices)):
            arg_i = arg_level_indices[i]
            if arg_i < len(self.args):
                arg = self.args[arg_i]
                if not arg.has_levels:
                    continue
                for level in arg.get_levels(row_count, filt):
                    level_use[level[1]] = 0

        for value in self.fvalues(row_count, filt):
            if is_missing(value):
                continue
            value = convert(value, str)
            if value in level_use:
                level_use[value] += 1

        levels = filter(lambda k: level_use[k] > 0, level_use)

        return enumerate(levels)

    @property
    def uses_column_formula(self):
        if self._function.meta.is_column_wise:
            return True

        for arg in self.args:
            if arg.uses_column_formula:
                return True

        return False

    def _delete(self):
        for arg in self.args:
            arg._remove_node_parent(self)


class BinOp(ast.BinOp, Node):

    def __init__(self, *args, **kwargs):
        ast.BinOp.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):

        lv = self.left
        rv = self.right
        op = self.op

        dt = self.data_type
        if dt is DataType.DECIMAL:
            ul_type = float
        elif dt is DataType.TEXT:
            ul_type = str
        else:
            ul_type = int

        if isinstance(lv, ast.Constant):
            lv = lv.value
        elif hasattr(lv, 'fvalue'):
            lv = lv.fvalue(index, row_count, filt)

        lv = convert(lv, ul_type)

        if isinstance(rv, ast.Constant):
            rv = rv.value
        elif hasattr(rv, 'fvalue'):
            rv = rv.fvalue(index, row_count, filt)

        rv = convert(rv, ul_type)

        if ul_type is str and isinstance(op, ast.Add):
            pass
        else:
            if is_missing(lv) or is_missing(rv):
                return get_missing(int)

        if isinstance(op, ast.Add):
            return lv + rv
        elif isinstance(op, ast.Sub):
            return lv - rv
        elif isinstance(op, ast.Mult):
            return lv * rv
        elif isinstance(op, ast.Div):
            try:
                return float(lv) / float(rv)
            except ZeroDivisionError:
                return get_missing()
        elif isinstance(op, ast.FloorDiv):
            try:
                return lv // rv
            except ZeroDivisionError:
                return get_missing()
        elif isinstance(op, ast.Mod):
            return lv % rv
        elif isinstance(op, ast.Pow):
            return lv ** rv
        elif isinstance(op, ast.BitXor):
            return lv ** rv
        else:
            return get_missing()

    def _can_vectorise(self):
        return (self.data_type is not DataType.TEXT
                and isinstance(self.op, BinOp.VECTORISED_OPS))

    VECTORISED_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow, ast.BitXor)

    def _vchunk(self, start, end, row_count, filt):
        ul_type = float if self.data_type is DataType.DECIMAL else int
        left = as_chunk(self.left.fchunk(start, end, row_count, filt), ul_type)
        right = as_chunk(self.right.fchunk(start, end, row_count, filt), ul_type)
        a = left.values
        b = right.values
        missing = left.missing | right.missing
        errors = any_errors(left, right)
        if errors is None:
            errors = np.zeros(len(a), dtype=bool)
        op = self.op

        if ul_type is int and (np.any(np.abs(a) > 2 ** 31) or np.any(np.abs(b) > 2 ** 31)):
            raise NotVectorisable()

        with np.errstate(all='ignore'):
            if isinstance(op, ast.Add):
                values = a + b
            elif isinstance(op, ast.Sub):
                values = a - b
            elif isinstance(op, ast.Mult):
                values = a * b
            elif isinstance(op, ast.Div):
                missing |= b == 0
                values = a / b
            elif isinstance(op, ast.FloorDiv):
                missing |= b == 0
                values = np.floor_divide(a, np.where(b == 0, 1, b))
            elif isinstance(op, ast.Mod):
                errors |= (b == 0) & ~missing  # ZeroDivisionError
                values = np.mod(a, np.where(b == 0, 1, b))
            else:  # Pow, BitXor
                values = np.power(a, b)
                finite = np.isfinite(a) & np.isfinite(b) & ~missing
                if np.any(finite & np.isnan(values)):
                    raise NotVectorisable()  # a negative to a fraction is complex
                errors |= finite & np.isinf(values)  # OverflowError, ZeroDivisionError

        if ul_type is float:
            values[missing] = np.nan
            chunk = Chunk(values, errors if errors.any() else None)
            # infinities in, as python has them
            unsure = ~missing & (np.isinf(a) | np.isinf(b))
            if unsure.any():
                self._patch(chunk, np.flatnonzero(unsure), start, row_count, filt)
        else:
            values[missing] = INT_MISSING
            if np.any(np.abs(values[~missing]) > 2 ** 31 - 1):
                raise NotVectorisable()  # python's integers don't overflow
            chunk = Chunk(values, errors if errors.any() else None)
        return chunk

    def _gives_plain_values(self, filt):
        return True

    def is_atomic_node(self):
        return self.left.is_atomic_node() and self.right.is_atomic_node()

    @property
    def data_type(self):

        if isinstance(self.op, ast.Pow):
            return DataType.DECIMAL
        elif isinstance(self.op, ast.Div):
            return DataType.DECIMAL
        elif isinstance(self.op, ast.FloorDiv):
            return DataType.INTEGER

        ldt = self.left.data_type
        rdt = self.right.data_type

        if ldt is DataType.TEXT or rdt is DataType.TEXT:
            return DataType.TEXT
        elif ldt is DataType.DECIMAL or rdt is DataType.DECIMAL:
            return DataType.DECIMAL
        else:
            return DataType.INTEGER

    @property
    def measure_type(self):

        if isinstance(self.op, ast.Pow):
            return MeasureType.CONTINUOUS
        elif isinstance(self.op, ast.Div):
            return MeasureType.CONTINUOUS
        elif isinstance(self.op, ast.FloorDiv):
            return MeasureType.CONTINUOUS

        if self.data_type is DataType.INTEGER:
            return MeasureType.CONTINUOUS

        lmt = self.left.measure_type
        rmt = self.right.measure_type

        if lmt is MeasureType.ID or rmt is MeasureType.ID:
            if self.data_type is DataType.TEXT:
                return MeasureType.ID

        if lmt is MeasureType.CONTINUOUS or rmt is MeasureType.CONTINUOUS:
            if self.data_type is not DataType.TEXT:
                return MeasureType.CONTINUOUS

        if lmt is MeasureType.NOMINAL or rmt is MeasureType.NOMINAL:
            return MeasureType.NOMINAL
        else:
            return MeasureType.ORDINAL

    @property
    def has_levels(self):
        return False

    @property
    def uses_column_formula(self):
        return self.left.uses_column_formula or self.right.uses_column_formula

    def _delete(self):
        self.left._remove_node_parent(self)
        self.right._remove_node_parent(self)


class Compare(ast.Compare, Node):

    def __init__(self, *args, **kwargs):
        ast.Compare.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        v1 = self.left.fvalue(index, row_count, filt)
        if is_missing(v1):
            return get_missing(int)
        for i in range(len(self.ops)):
            op = self.ops[i]
            v2 = self.comparators[i].fvalue(index, row_count, filt)
            if is_missing(v2):
                return get_missing(int)
            if not Compare._test(v1, op, v2):
                return 0
            v1 = v2
        return 1

    @staticmethod
    def _test(v1, op, v2):

        if isinstance(v1, tuple) and isinstance(v2, tuple):
            v1 = convert(v1, int)
            v2 = convert(v2, int)
        elif isinstance(v1, tuple):
            v1 = v1[1 if isinstance(v2, str) else 0]
        elif isinstance(v2, tuple):
            v2 = v2[1 if isinstance(v1, str) else 0]

        if isinstance(op, ast.Lt):
            return v1 < v2
        elif isinstance(op, ast.Gt):
            return v1 > v2
        elif isinstance(op, ast.GtE):
            return v1 >= v2
        elif isinstance(op, ast.LtE):
            return v1 <= v2
        elif isinstance(op, ast.Eq):
            if isinstance(v1, Number) and isinstance(v2, float):
                return math.isclose(float(v1), v2)
            elif isinstance(v1, float) and isinstance(v2, Number):
                return math.isclose(v1, float(v2))
            else:
                return v1 == v2
        elif isinstance(op, ast.NotEq):
            if isinstance(v1, float) or isinstance(v2, Number):
                return not math.isclose(v1, float(v2))
            elif isinstance(v1, Number) or isinstance(v2, float):
                return not math.isclose(float(v1), v2)
            else:
                return v1 != v2
        else:
            raise RuntimeError("Shouldn't get here")

    def _can_vectorise(self):
        if self.left.data_type is DataType.TEXT:
            return False
        for comp in self.comparators:
            if comp.data_type is DataType.TEXT:
                return False
        return True

    def _vchunk(self, start, end, row_count, filt):
        # each row is missing if a value is, 0 at the first comparison that
        # fails (later values aren't evaluated for that row), otherwise 1
        n = end - start
        result = np.ones(n, dtype=np.int64)
        undecided = np.ones(n, dtype=bool)
        errors = np.zeros(n, dtype=bool)

        def evaluate(node):
            chunk = as_chunk(node.fchunk(start, end, row_count, filt))
            if chunk.errors is not None:
                failed = chunk.errors & undecided
                errors[failed] = True
                undecided[failed] = False
            missing = chunk.missing & undecided
            result[missing] = INT_MISSING
            undecided[missing] = False
            return chunk

        v1 = evaluate(self.left)
        for op, comp in zip(self.ops, self.comparators):
            v2 = evaluate(comp)
            fails = ~Compare._vtest(v1, op, v2) & undecided
            result[fails] = 0
            undecided[fails] = False
            v1 = v2

        return Chunk(result, errors if errors.any() else None)

    def _gives_plain_values(self, filt):
        return True

    @staticmethod
    def _isclose(a, b):
        # as math.isclose()
        a = a.astype(np.float64)
        b = b.astype(np.float64)
        with np.errstate(all='ignore'):
            close = np.abs(a - b) <= 1e-09 * np.maximum(np.abs(a), np.abs(b))
        return (a == b) | (close & np.isfinite(a) & np.isfinite(b))

    @staticmethod
    def _vtest(v1, op, v2):
        a = v1.values
        b = v2.values
        if isinstance(op, ast.Lt):
            return a < b
        elif isinstance(op, ast.Gt):
            return a > b
        elif isinstance(op, ast.GtE):
            return a >= b
        elif isinstance(op, ast.LtE):
            return a <= b
        elif isinstance(op, ast.Eq):
            if v1.is_float or v2.is_float:
                return Compare._isclose(a, b)
            else:
                return a == b
        elif isinstance(op, ast.NotEq):
            return ~Compare._isclose(a, b)
        else:
            raise NotVectorisable()

    def is_atomic_node(self):
        if self.left.is_atomic_node() is False:
            return False
        for node in self.comparators:
            if node.is_atomic_node() is False:
                return False
        return True

    @property
    def data_type(self):
        return DataType.INTEGER

    @property
    def measure_type(self):
        return MeasureType.NOMINAL

    @property
    def has_levels(self):
        return True

    def get_levels(self, row_count, filt):
        return ((1, 'true'), (0, 'false'))

    @property
    def uses_column_formula(self):
        if self.left.uses_column_formula:
            return True

        for comp in self.comparators:
            if comp.uses_column_formula:
                return True

        return False

    def _delete(self):
        self.left._remove_node_parent(self)
        for comp in self.comparators:
            comp._remove_node_parent(self)


class keyword(ast.keyword, Node):

    def __init__(self, *args, **kwargs):
        ast.keyword.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        return self.value.fvalue(index, row_count, filt)

    def is_atomic_node(self):
        return self.value.is_atomic_node()

    def get_levels(self, row_count, filt):
        return self.value.get_levels(row_count, filt)

    @property
    def data_type(self):
        self.value.data_type

    @property
    def measure_type(self):
        self.value.measure_type

    @property
    def has_levels(self):
        return self.value.has_levels

    @property
    def uses_column_formula(self):
        return self.value.uses_column_formula

    def _delete(self):
        self.value._remove_node_parent(self)


class Tuple(ast.Tuple, Node):
    def __init__(self, *args, **kwargs):
        ast.Tuple.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        return (self.elts[0].value, self.elts[1].value)

    @property
    def data_type(self):
        return DataType.INTEGER

    @property
    def measure_type(self):
        return MeasureType.ORDINAL

    @property
    def has_levels(self):
        return True

    def get_levels(self, row_count, filt):
        return ((self.elts[0].value, self.elts[1].value),)
