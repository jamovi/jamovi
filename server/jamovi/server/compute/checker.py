
from ast import NodeVisitor
from ast import walk
import ast
from inspect import signature
from inspect import Parameter
from math import isnan
from ..i18n import _

from jamovi.core import ColumnType

from . import functions


class Checker(NodeVisitor):

    LEGAL_NODES = [ ast.Name, ast.Num, ast.Str, ast.Call, ast.Load,
                    ast.UnaryOp, ast.UAdd, ast.USub, ast.Not, ast.Invert,
                    ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod,
                    ast.Pow, ast.FloorDiv,
                    ast.Compare, ast.Eq, ast.NotEq, ast.Gt, ast.GtE, ast.Lt,
                    ast.LtE, ast.BoolOp, ast.And, ast.Or, ast.keyword ]

    @staticmethod
    def check(node, column=None, dataset=None):
        for child in walk(node):
            if not any(map(lambda t: isinstance(child, t), Checker.LEGAL_NODES)):
                raise SyntaxError(_('Formula contains illegal node'))

        if dataset is None:
            dataset = column._parent

        checker = Checker(column, dataset)
        checker.visit(node)  # throws if problem

    def __init__(self, column, dataset):
        NodeVisitor.__init__(self)
        self._column = column
        self._dataset = dataset

    def visit_Call(self, node):

        name = node.func.id

        min_args = 0
        max_args = 0

        if hasattr(functions, name):
            func = getattr(functions, name)
            skip_first = func.meta.is_row_wise
        else:
            raise NameError(_('Function {}() does not exist').format(name))

        if func.meta.is_column_wise:
            # allow the group_by positional argument
            max_args += 1

        sig = signature(func)
        fun_kwargs = [ ]

        for arg_name in sig.parameters:
            if skip_first:
                skip_first = False
                continue

            arg = sig.parameters[arg_name]
            if arg.kind is Parameter.POSITIONAL_OR_KEYWORD:
                max_args += 1
                if arg.default is Parameter.empty:
                    min_args += 1
            elif arg.kind is Parameter.VAR_POSITIONAL:
                max_args = float('nan')
            elif arg.kind is Parameter.KEYWORD_ONLY:
                fun_kwargs.append(arg.name)
                max_args += 1
            else:
                raise RuntimeError(_('Bad function definition'))

        kwargs_provided = map(lambda x: x.arg, node.keywords)
        for kwarg in kwargs_provided:
            if func.meta.has_group_by and kwarg == 'group_by':
                continue
            if kwarg not in fun_kwargs:
                raise TypeError(_("'{}' is not an argument for {}()\n(If you're wanting to test equality, use two equal signs '==')").format(kwarg, name))

        if len(node.args) > max_args or len(node.args) < min_args:
            plural = 's' if min_args != 1 else ''
            if max_args == min_args:
                raise TypeError(_('Function {}() takes {} argument{}').format(name, min_args, plural))
            elif isnan(max_args):
                raise TypeError(_('Function {}() requires atleast {} argument{}').format(name, min_args, plural))
            else:
                raise TypeError(_('Function {}() requires between {} and {} arguments').format(name, min_args, max_args))

        for arg in node.args:
            self.visit(arg)
        for arg in node.keywords:
            self.visit(arg.value)

    def visit_Name(self, node):
        depcy_name = node.id

        if depcy_name == 'NA':
            return

        if depcy_name == '$source':
            return

        if self._column is not None and self._column.name == depcy_name:
            raise RecursionError()

        try:
            depcy = self._dataset[depcy_name]

            if self._column is None:
                return

            if self._column.is_filter:
                if not depcy.is_filter and depcy.uses_column_formula:
                    raise ValueError(_("Filters may not reference columns using 'V' or column functions"))

            if self._column.is_filter:
                if depcy.column_type is ColumnType.OUTPUT:
                    raise ValueError(_('Filters may not reference output variables'))

            depcies = depcy.dependencies
            depcies_names = map(lambda x: x.name, depcies)
            if self._column.name in depcies_names:
                raise RecursionError()

        except KeyError:
            raise NameError(_("Column '{}' does not exist in the dataset").format(depcy_name))
