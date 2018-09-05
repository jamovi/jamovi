
from ast import NodeVisitor
from ast import walk
from inspect import signature
from inspect import Parameter
from math import isnan

from . import functions


class Checker(NodeVisitor):

    LEGAL_NODES = [ 'Name', 'Num', 'Str', 'Call', 'Load',
                    'UnaryOp', 'UAdd', 'USub', 'Not', 'Invert',
                    'BinOp', 'Add', 'Sub', 'Mult', 'Div', 'Mod', 'Pow',
                    'Compare', 'Eq', 'NotEq', 'Gt', 'GtE', 'Lt', 'LtE',
                    'BoolOp', 'And', 'Or', 'keyword' ]

    @staticmethod
    def check(node, column=None, dataset=None):
        for child in walk(node):
            if child.__class__.__name__ not in Checker.LEGAL_NODES:
                raise SyntaxError('Formula contains illegal node')

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
            raise NameError('Function {}() does not exist'.format(name))

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
                raise RuntimeError('Bad function definition')

        kwargs_provided = map(lambda x: x.arg, node.keywords)
        for kwarg in kwargs_provided:
            if kwarg not in fun_kwargs:
                raise TypeError("'{}' is not an argument for {}()\n(If you're wanting to test equality, use two equal signs '==')".format(kwarg, name))

        if len(node.args) > max_args or len(node.args) < min_args:
            plural = 's' if min_args != 1 else ''
            if max_args == min_args:
                raise TypeError('Function {}() takes {} argument{}'.format(name, min_args, plural))
            elif isnan(max_args):
                raise TypeError('Function {}() requires atleast {} argument{}'.format(name, min_args, plural))
            else:
                raise TypeError('Function {}() requires between {} and {} arguments'.format(name, min_args, max_args))

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
                    raise ValueError("Filters may not reference columns using 'V' or column functions")

            depcies = depcy.dependencies
            depcies_names = map(lambda x: x.name, depcies)
            if self._column.name in depcies_names:
                raise RecursionError()

        except KeyError:
            raise NameError("Column '{}' does not exist in the dataset".format(depcy_name))
