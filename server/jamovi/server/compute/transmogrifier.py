
from ast import NodeTransformer

from .nodes import Call
from .nodes import Num
from .nodes import Str
from .nodes import BinOp
from .nodes import UnaryOp
from .nodes import BoolOp
from .nodes import Compare


class Transmogrifier(NodeTransformer):

    def __init__(self, dataset, parent=None):
        self._dataset = dataset
        self._parent = parent

    def visit_Name(self, node):
        if node.id == 'NA':
            return Num(-2147483648)
        elif node.id == '$value' and self._parent is not None:
            return self._parent
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

    def visit_Str(self, node):
        return Str(node.s)

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

    def visit_BoolOp(self, node):
        new_values = node.values
        for i in range(len(new_values)):
            new_value = new_values[i]
            new_value = self.visit(new_value)
            new_values[i] = new_value
        nu = BoolOp(op=node.op, values=new_values)
        for value in new_values:
            value._add_node_parent(nu)
        return nu

    def visit_Compare(self, node):
        left = self.visit(node.left)
        new_comps = node.comparators
        for i in range(len(new_comps)):
            new_comp = new_comps[i]
            new_comp = self.visit(new_comp)
            new_comps[i] = new_comp
        nu = Compare(left=left, ops=node.ops, comparators=new_comps)
        left._add_node_parent(nu)
        for comp in new_comps:
            comp._add_node_parent(nu)
        return nu
