
import ast

_LEGAL_NODES = [ 'Module', 'Num', 'Str', 'Name', 'Load', 'Expr', 'UnaryOp',
                 'UAdd', 'USub', 'BinOp', 'Add', 'Sub', 'Mult', 'Div', 'Mod',
                 'Pow', 'BitXor', 'Call' ]


class Checker:

    @staticmethod
    def check_tree(tree):

        if len(tree.body) >= 2:
            raise SyntaxError('Multiple expressions specified')

        for node in ast.walk(tree):
            if node.__class__.__name__ not in _LEGAL_NODES:
                raise SyntaxError('Formula contains illegal node')
