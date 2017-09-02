
from ast import NodeTransformer

from .nodes import Call
from .nodes import Num
from .nodes import BinOp
from .nodes import UnaryOp


class Transmogrifier(NodeTransformer):

    def __init__(self, dataset):
        self._dataset = dataset

    def visit_Name(self, node):
        try:
            return self._dataset[node.id]
        except KeyError:
            raise NameError("Column '{}' does not exist in the dataset".format(node.id))

    def visit_Call(self, node):
        new_args = node.args
        for i in range(len(new_args)):
            new_arg = new_args[i]
            new_arg = self.visit(new_arg)
            new_args[i] = new_arg
        nu = Call(func=node.func, args=new_args, keywords=node.keywords)
        for arg in new_args:
            arg._add_node_parent(nu)
        return nu

    def visit_Num(self, node):
        return Num(node.n)

    def visit_BinOp(self, node):
        left = self.visit(node.left)
        right = self.visit(node.right)
        op = node.op
        nu = BinOp(left=left, op=op, right=right)
        left._add_node_parent(nu)
        right._add_node_parent(nu)
        return nu

    def visit_UnaryOp(self, node):
        operand = self.visit(node.operand)
        nu = UnaryOp(op=node.op, operand=operand)
        operand._add_node_parent(nu)
        return nu
