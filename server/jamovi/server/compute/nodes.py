

import ast
from inspect import signature
from inspect import Parameter
from types import FunctionType as function
import math

from jamovi.core import MeasureType
from ..utils import FValues
from ..utils import convert
from ..utils import is_missing
from ..utils import get_missing
from . import functions

NaN = float('nan')


class Num(ast.Num):

    def __init__(self, *args, **kwargs):
        ast.Num.__init__(self, *args, **kwargs)
        self._node_parents = [ ]

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        self._node_parents.remove(node)

    def fvalue(self, index):
        return self.n

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return True

    @property
    def measure_type(self):
        if isinstance(self.n, int):
            return MeasureType.ORDINAL
        else:
            return MeasureType.CONTINUOUS

    @property
    def needs_recalc(self):
        return False

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        pass


class Str(ast.Str):

    def __init__(self, *args, **kwargs):
        ast.Str.__init__(self, *args, **kwargs)
        self._node_parents = [ ]

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        self._node_parents.remove(node)

    def fvalue(self, index):
        return self.s

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return True

    @property
    def measure_type(self):
        return MeasureType.NOMINAL_TEXT

    @property
    def needs_recalc(self):
        return False

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        pass


class UnaryOp(ast.UnaryOp):

    def __init__(self, *args, **kwargs):
        ast.UnaryOp.__init__(self, *args, **kwargs)
        self._node_parents = [ ]

    def fvalue(self, index):
        op = self.op
        v = self.operand.fvalue(index)
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

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return self.operand.is_atomic_node()

    @property
    def measure_type(self):
        if isinstance(self.op, ast.UAdd):
            if self.operand.measure_type is MeasureType.NOMINAL_TEXT:
                return MeasureType.CONTINUOUS
            else:
                return self.operand.measure_type
        elif isinstance(self.op, ast.Not):
            return MeasureType.NOMINAL
        elif isinstance(self.op, ast.Invert):
            return MeasureType.NOMINAL_TEXT
        else:
            return self.operand.measure_type

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        self._node_parents.remove(node)

    @property
    def needs_recalc(self):
        return False

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        for parent in self._node_parents:
            parent.needs_recalc = needs_recalc


class BoolOp(ast.BoolOp):

    def __init__(self, *args, **kwargs):
        ast.BoolOp.__init__(self, *args, **kwargs)
        self._node_parents = [ ]

    def fvalue(self, index):
        if isinstance(self.op, ast.And):
            for v in self.values:
                value = v.fvalue(index)
                if is_missing(value):
                    return 0
                if isinstance(value, tuple):
                    value = value[0]
                if not value:
                    return 0
            return 1
        elif isinstance(self.op, ast.Or):
            for v in self.values:
                value = v.fvalue(index)
                if is_missing(value):
                    continue
                if isinstance(value, tuple):
                    value = value[0]
                if value:
                    return 1
            return 0
        else:
            raise RuntimeError("Shouldn't get here")

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        for value in self.values:
            if not value.is_atomic_node():
                return False
        return True

    @property
    def measure_type(self):
        return MeasureType.NOMINAL

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        self._node_parents.remove(node)

    @property
    def needs_recalc(self):
        return False

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        for parent in self._node_parents:
            parent.needs_recalc = needs_recalc


class Call(ast.Call):

    def __init__(self, func, args, keywords):
        self._cached_value = None
        self._node_parents = [ ]
        self._arg_types = [ ]

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

    def fvalue(self, index):
        if self._function.__name__ == 'OFFSET':
            offset = convert(self.args[1].fvalue(index), int)
            if index < offset:
                value = NaN
            else:
                value = self.args[0].fvalue(index - offset)
        elif self._function.meta.is_column_wise:
            if self._cached_value is None:
                args = list(map(lambda arg: arg.fvalues(), self.args))
                for i in range(len(args)):
                    arg_type_i = min(i, len(self._arg_types) - 1)
                    arg_type = self._arg_types[arg_type_i]
                    args[i] = (convert(v, arg_type) for v in args[i])
                self._cached_value = self._function(*args)
            value = self._cached_value
        else:
            args = list(map(lambda arg: arg.fvalue(index), self.args))
            for i in range(len(args)):
                arg_type_i = min(i, len(self._arg_types) - 1)
                arg_type = self._arg_types[arg_type_i]
                args[i] = convert(args[i], arg_type)
            value = self._function(index, *args)

        return value

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return False

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        self._node_parents.remove(node)

    @property
    def needs_recalc(self):
        return self._cached_value is None

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        if needs_recalc:
            self._cached_value = None
        for parent in self._node_parents:
            parent.needs_recalc = needs_recalc

    @property
    def measure_type(self):
        return self._function.meta.determine_m_type(self.args)


class BinOp(ast.BinOp):

    def __init__(self, *args, **kwargs):
        ast.BinOp.__init__(self, *args, **kwargs)
        self._node_parents = [ ]

    def fvalue(self, index):

        lv = self.left
        rv = self.right
        op = self.op

        mt = self.measure_type
        if mt is MeasureType.CONTINUOUS:
            ul_type = float
        elif mt is MeasureType.NOMINAL_TEXT:
            ul_type = str
        else:
            ul_type = int

        if isinstance(lv, ast.Num):
            lv = lv.n
        elif hasattr(lv, 'fvalue'):
            lv = lv.fvalue(index)

        lv = convert(lv, ul_type)

        if isinstance(rv, ast.Num):
            rv = rv.n
        elif hasattr(rv, 'fvalue'):
            rv = rv.fvalue(index)

        rv = convert(rv, ul_type)

        if ul_type is not str and not isinstance(op, ast.Add):
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
                return lv / rv
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

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return self.left.is_atomic_node() and self.right.is_atomic_node()

    @property
    def measure_type(self):

        if isinstance(self.op, ast.Pow):
            return MeasureType.CONTINUOUS

        lmt = self.left.measure_type
        rmt = self.right.measure_type

        if lmt is MeasureType.NOMINAL_TEXT or rmt is MeasureType.NOMINAL_TEXT:
            return MeasureType.NOMINAL_TEXT
        elif lmt is MeasureType.CONTINUOUS or rmt is MeasureType.CONTINUOUS:
            return MeasureType.CONTINUOUS
        elif lmt is MeasureType.NOMINAL or rmt is MeasureType.NOMINAL:
            return MeasureType.NOMINAL
        else:
            return MeasureType.ORDINAL

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        self._node_parents.remove(node)

    @property
    def needs_recalc(self):
        return False

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        for parent in self._node_parents:
            parent.needs_recalc = needs_recalc


class Compare(ast.Compare):

    def __init__(self, *args, **kwargs):
        ast.Compare.__init__(self, *args, **kwargs)
        self._node_parents = [ ]

    def fvalue(self, index):
        v1 = self.left.fvalue(index)
        if is_missing(v1):
            return get_missing(int)
        for i in range(len(self.ops)):
            op = self.ops[i]
            v2 = self.comparators[i].fvalue(index)
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
            if isinstance(v1, float) or isinstance(v2, float):
                return math.isclose(float(v1), float(v2))
            else:
                return v1 == v2
        elif isinstance(op, ast.NotEq):
            if isinstance(v1, float) or isinstance(v2, float):
                return not math.isclose(float(v1), float(v2))
            else:
                return v1 != v2
        else:
            raise RuntimeError("Shouldn't get here")

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        if self.left.ris_atomic_node() is False:
            return False
        for node in self.comparators:
            if node.is_atomic_node() is False:
                return False
        return True

    @property
    def measure_type(self):
        return MeasureType.NOMINAL

    def _add_node_parent(self, node):
        self._node_parents.append(node)

    def _remove_node_parent(self, node):
        self._node_parents.remove(node)

    @property
    def needs_recalc(self):
        return False

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        for parent in self._node_parents:
            parent.needs_recalc = needs_recalc
