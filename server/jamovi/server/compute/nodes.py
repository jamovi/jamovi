

import ast

from .functions import ColumnFunctions
from .functions import RowFunctions
from ..utils import FValues

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
        return float(self.n)

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return True

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
        if isinstance(self.op, ast.USub):
            return -self.operand.fvalue(index)
        else:
            return self.operand.fvalue(index)

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return self.operand.is_atomic_node()

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
        self._is_column_function = False
        self._node_parents = [ ]

        name = func.id

        if hasattr(ColumnFunctions, name):
            self._is_column_function = True
            self._function = getattr(ColumnFunctions, name)
        elif hasattr(RowFunctions, name):
            self._is_column_function = False
            self._function = getattr(RowFunctions, name)
        else:
            raise NameError('Function {}() does not exist'.format(name))

        ast.Call.__init__(self, func, args, keywords)

    def fvalue(self, index):
        if self._is_column_function:
            if self._cached_value is not None:
                return self._cached_value
            args = map(lambda arg: arg.fvalues(), self.args)
            value = self._function(*args)
            self._cached_value = value
            return value
        else:
            args  = map(lambda arg: arg.fvalue(index), self.args)
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


class BinOp(ast.BinOp):

    def __init__(self, *args, **kwargs):
        ast.BinOp.__init__(self, *args, **kwargs)
        self._node_parents = [ ]

    def fvalue(self, index):
        lv = self.left
        rv = self.right

        if isinstance(lv, ast.Num):
            lv = lv.n
        elif hasattr(lv, 'fvalue'):
            lv = lv.fvalue(index)
            if isinstance(lv, float):
                pass
            elif isinstance(lv, int):
                if lv == -2147483648:
                    lv = NaN
                else:
                    float(lv)
            else:
                lv = NaN

        if isinstance(rv, ast.Num):
            rv = rv.n
        elif hasattr(rv, 'fvalue'):
            rv = rv.fvalue(index)
            if isinstance(rv, float):
                pass
            elif isinstance(rv, int):
                if rv == -2147483648:
                    rv = NaN
                else:
                    float(rv)
            else:
                rv = NaN

        op = self.op

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
                return NaN
        elif isinstance(op, ast.Mod):
            return lv % rv
        elif isinstance(op, ast.Pow):
            return lv ** rv
        elif isinstance(op, ast.BitXor):
            return lv ** rv
        else:
            return NaN

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return self.left.is_atomic_node() and self.right.is_atomic_node()

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
