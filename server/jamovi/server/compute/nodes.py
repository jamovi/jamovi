

import ast
from inspect import signature
from inspect import Parameter
from types import FunctionType as function
import math
from collections import OrderedDict
from numbers import Number
from itertools import compress

from jamovi.core import DataType
from jamovi.core import MeasureType
from . import FValues
from . import convert
from . import is_missing
from . import get_missing
from . import is_equal
from . import functions

NaN = float('nan')


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
                levels = self._split_by.get_levels(row_count)
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


class Num(ast.Num, Node):

    def __init__(self, *args, **kwargs):
        ast.Num.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        return self.n

    def is_atomic_node(self):
        return True

    @property
    def data_type(self):
        if isinstance(self.n, int):
            return DataType.INTEGER
        else:
            return DataType.DECIMAL

    @property
    def measure_type(self):
        if isinstance(self.n, int):
            return MeasureType.ORDINAL
        else:
            return MeasureType.CONTINUOUS

    @property
    def has_levels(self):
        return False

    @property
    def uses_column_formula(self):
        return False


class Str(ast.Str, Node):

    def __init__(self, *args, **kwargs):
        ast.Str.__init__(self, *args, **kwargs)
        Node.__init__(self)

    def fvalue(self, index, row_count, filt):
        return self.s

    def is_atomic_node(self):
        return True

    @property
    def data_type(self):
        return DataType.TEXT

    @property
    def measure_type(self):
        return MeasureType.NOMINAL

    @property
    def has_levels(self):
        return True

    def get_levels(self, row_count):
        return [ (0, self.s) ]

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
        self._arg_types = [ ]
        self._kw_types = [ ]
        self._d_type = None
        self._m_type = None

        name = func.id

        if not hasattr(functions, name):
            raise NameError('Function {}() does not exist'.format(name))

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
            if index < offset:
                value = NaN
            else:
                value = self.args[0].fvalue(index - offset, row_count, False)
        elif self._function.meta.is_column_wise:
            if self._cached_value is None:
                group_by = None
                args = list(self.args)
                for i in range(len(args)):
                    arg = args[i]
                    if i != 1:
                        arg_type_i = min(i, len(self._arg_types) - 1)
                        arg_type = self._arg_types[arg_type_i]
                        args[i] = FValueConverter(arg.fvalues(row_count, filt), arg_type)
                    else:
                        # at this stage, all V functions take a single argument
                        # so the second is always the group_by ... this could
                        # change in the future, and this will need updating
                        group_by = arg.fvalues(row_count, filt)
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

    def is_atomic_node(self):
        return False

    @property
    def needs_recalc(self):
        return self._cached_value is None

    def set_needs_recalc(self):
        self._cached_value = None
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

    def get_levels(self, row_count):

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
                for level in arg.get_levels(row_count):
                    level_use[level[1]] = 0

        for value in self.fvalues(row_count, False):
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

        if isinstance(lv, ast.Num):
            lv = lv.n
        elif hasattr(lv, 'fvalue'):
            lv = lv.fvalue(index, row_count, filt)

        lv = convert(lv, ul_type)

        if isinstance(rv, ast.Num):
            rv = rv.n
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

    def get_levels(self, row_count):
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

    def get_levels(self, row_count):
        return self.value.get_levels(row_count)

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
        return (self.elts[0].n, self.elts[1].s)

    @property
    def data_type(self):
        return DataType.INTEGER

    @property
    def measure_type(self):
        return MeasureType.ORDINAL

    @property
    def has_levels(self):
        return True

    def get_levels(self, row_count):
        return ((self.elts[0].n, self.elts[1].s),)
