

import ast
from inspect import signature
from types import FunctionType as function

from ..utils import FValues
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
        self._node_parents = [ ]

        name = func.id

        if not hasattr(functions, name):
            raise NameError('Function {}() does not exist'.format(name))

        self._function = getattr(functions, name)
        self._function.is_column_wise = self._function.is_column_wise

        # the following checks and substitutes sub-functions
        # see BOXCOX() or Z() for an example of a function
        # with sub-functions

        params = signature(self._function).parameters
        param_names = list(params)
        if self._function.is_row_wise:
            param_names.pop(0)
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
                args.append(Call(ast.Name(id=sub_func_name), sub_func_args, keywords))
            else:
                break

        ast.Call.__init__(self, func, args, keywords)

    def fvalue(self, index):
        if self._function.__name__ == 'OFFSET':
            offset = int(self.args[1].fvalue(index))
            if index < offset:
                return NaN
            else:
                return self.args[0].fvalue(index - offset)
        elif self._function.is_column_wise:
            if self._cached_value is None:
                args = map(lambda arg: arg.fvalues(), self.args)
                self._cached_value = self._function(*args)
            return self._cached_value
        else:
            args = map(lambda arg: arg.fvalue(index), self.args)
            return self._function(index, *args)

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
