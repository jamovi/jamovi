
import ast

from .functions import RowFunctions


class Evaluator(ast.NodeVisitor):

    def __init__(self, column):
        self._row_no = None
        self._column = column
        self._dataset = column._parent

    @property
    def row_no(self):
        return self._row_no

    @row_no.setter
    def row_no(self, row_no):
        self._row_no = row_no

    def visit_Module(self, node):
        if len(node.body) == 0:
            self._column[self._row_no] = float('nan')
        else:
            self._column[self._row_no] = self.visit(node.body[0])

    def visit_Num(self, node):
        return node.n

    def visit_Expr(self, node):
        return self.visit(node.value)

    def visit_Name(self, node):
        return node.column[self._row_no]

    def visit_Call(self, node):
        name = node.func.id

        if not hasattr(RowFunctions, name):
            raise NameError('Function {}() does not exist'.format(name))

        args = list(map(lambda arg: self.visit(arg), node.args))
        fun = getattr(RowFunctions, name)
        value = fun(self._row_no, *args)
        return value

    def visit_BinOp(self, node):
        lv = self.visit(node.left)
        rv = self.visit(node.right)
        op = node.op

        if isinstance(op, ast.Add):
            return lv + rv
        elif isinstance(op, ast.Sub):
            return lv - rv
        elif isinstance(op, ast.Mult):
            return lv * rv
        elif isinstance(op, ast.Div):
            return lv / rv
        elif isinstance(op, ast.Mod):
            return lv % rv
        elif isinstance(op, ast.Pow):
            return lv ** rv
        elif isinstance(op, ast.BitXor):
            return lv ** rv
        else:
            return float('nan')
