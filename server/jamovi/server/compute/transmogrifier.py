
from ast import NodeTransformer
from ast import Name
from ast import Eq
from ast import NotEq

from .nodes import Call
from .nodes import Num
from .nodes import Str
from .nodes import BinOp
from .nodes import UnaryOp
from .nodes import BoolOp
from .nodes import Compare
from .nodes import Tuple


class Transmogrifier(NodeTransformer):

    def __init__(self, dataset, parent=None):
        self._dataset = dataset
        self._parent = parent

    def visit_Name(self, node):
        if node.id == 'NA':
            return Num(-2147483648)
        elif node.id == '$source' and self._parent is not None:
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

    def visit_Tuple(self, node):
        return Tuple(node.elts, node.ctx)

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

        if len(node.comparators) == 1:
            left = node.left
            right = node.comparators[0]
            op = node.ops[0]
            args = None
            # special handling of X == NA, NA == X, X != NA, NA != X
            if isinstance(right, Name) and right.id == 'NA':
                if isinstance(op, Eq):
                    args = [ left, Num(n=1), Num(n=0) ]
                elif isinstance(op, NotEq):
                    args = [ left, Num(n=0), Num(n=1) ]
            elif isinstance(left, Name) and left.id == 'NA':
                if isinstance(op, Eq):
                    args = [ right, Num(n=1), Num(n=0) ]
                elif isinstance(op, NotEq):
                    args = [ right, Num(n=0), Num(n=1) ]
            if args is not None:
                nu = Call(func=Name(id='IFMISS'), args=args, keywords=[ ])
                return self.visit(nu)

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
