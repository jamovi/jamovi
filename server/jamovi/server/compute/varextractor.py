
import ast


class VarExtractor(ast.NodeVisitor):

    def __init__(self):
        self._vars = set()

    def visit(self, node):
        ast.NodeVisitor.visit(self, node)
        return list(self._vars)

    def visit_Name(self, node):
        self._vars.add(node.id)

    def visit_Call(self, node):
        # visit the arguments, but don't visit the function name
        # otherwise function names end up in the vars
        for child_node in node.args:
            self.visit(child_node)
