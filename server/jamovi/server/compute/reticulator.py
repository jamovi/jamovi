
from ast import NodeTransformer
from ast import Name
from ast import Num
from ast import copy_location

from .functions import ColumnFunctions


class Reticulator(NodeTransformer):

    def __init__(self, column):
        self._column = column
        self._dataset = column._parent

    def visit_Name(self, node):
        node.column = self._dataset[node.id]
        return node

    def visit_Call(self, node):
        name = node.func.id
        if hasattr(ColumnFunctions, name):
            columns = list()
            for child in node.args:
                if isinstance(child, Name):
                    columns.append(child.column)
                else:
                    raise TypeError('Column functions may only receive variable names')
            fun = getattr(ColumnFunctions, name)
            value = fun(*columns)
            literal = Num(value)
            literal = copy_location(literal, node)
            return literal
        else:
            for child in node.args:
                self.visit(child)
        return node
