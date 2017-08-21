
from ast import NodeTransformer
from ast import copy_location
from ast import Name
from ast import Load


class Transmogrifier(NodeTransformer):

    def __init__(self, column):
        self._column = column
        self._dataset = column._parent

    def visit_Name(self, node):
        node.column = self._dataset[node.id]
        return node

    def visit_Str(self, node):
        return copy_location(Name(
            id=node.s,
            ctx=Load(),
            column=self._dataset[node.s]
        ), node)

    def visit_Call(self, node):
        # this override prevents 'visiting' the Call's name
        # which would fail because visit_Name is expecting column names
        for child in node.args:
            self.visit(child)
        return node
