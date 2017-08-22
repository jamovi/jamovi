
from ast import NodeVisitor
from ast import Name

from .functions import ColumnFunctions


class Exfiltrator(NodeVisitor):

    def __init__(self):
        self._col_vars = set()
        self._row_vars = set()

    def visit_Module(self, node):
        self._col_vars = set()
        self._row_vars = set()

        for expr in node.body:
            self.visit(expr)

        return (self._col_vars, self._row_vars)

    def visit_Call(self, node):
        name = node.func.id
        if hasattr(ColumnFunctions, name):
            for child in node.args:
                if isinstance(child, Name):
                    self._col_vars.add(child.id)
        else:
            for child in node.args:
                self.visit(child)

    def visit_Name(self, node):
        self._row_vars.add(node.id)
