
import ast


class Transfilterifier(ast.NodeTransformer):

    def __init__(self, filters):
        self._filters = filters

    def visit_Name(self, node):
        ops = [ ast.Eq() ] * len(self._filters)
        call = ast.Call(
            func=ast.Name(id='IF', ctx=ast.Load()),
            args=[
                ast.Compare(
                    left=ast.Num(1),
                    ops=ops,
                    comparators=self._filters),
                node,
                ast.Num(-2147483648) ],
            keywords=[ ],
            filterified=True)
        return call

    def visit_Call(self, node):
        if hasattr(node, 'filterified'):
            return node
        new_args = node.args
        for i in range(len(new_args)):
            new_arg = new_args[i]
            new_arg = self.visit(new_arg)
            new_args[i] = new_arg
        nu = ast.Call(func=node.func, args=new_args, keywords=node.keywords)
        return nu
