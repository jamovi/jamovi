
from ast import NodeTransformer


class Transmogrifier(NodeTransformer):

    def __init__(self, column):
        self._column = column
        self._dataset = column._parent

    def visit_Name(self, node):
        try:
            node.column = self._dataset[node.id]
            return node
        except KeyError:
            raise NameError("Column '{}' does not exist in the dataset".format(node.id))

    def visit_Call(self, node):
        new_args = node.args
        for i in range(len(new_args)):
            new_args[i] = self.visit(new_args[i])
        node.args = new_args
        return node
