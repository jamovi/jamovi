
import ast
import keyword

from .varextractor import VarExtractor


_ESCAPED_KW = list(map(lambda x: '_' + x[1:], keyword.kwlist))

_LEGAL_NODES = [ 'Module', 'Num', 'Str', 'Name', 'Load', 'Expr', 'UnaryOp',
                 'UAdd', 'USub', 'BinOp', 'Add', 'Sub', 'Mult', 'Div', 'Mod',
                 'Pow', 'BitXor', 'Call' ]


def is_kw(word):
    word = ''.join(word)
    return word in keyword.kwlist


class Parser:

    @staticmethod
    def parse(str):

        escaped = Parser.escape(str)  # escape keywords
        tree = ast.parse(escaped)

        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                try:
                    # substitute unescaped node names back in
                    index = _ESCAPED_KW.index(node.id)
                    node.id = keyword.kwlist[index]
                except ValueError:
                    pass

        Parser.check_tree(tree)
        vars = VarExtractor().visit(tree)

        return (tree, vars)

    @staticmethod
    def check_tree(tree):

        if len(tree.body) >= 2:
            raise SyntaxError('Multiple expressions specified')

        for node in ast.walk(tree):
            if node.__class__.__name__ not in _LEGAL_NODES:
                raise SyntaxError('Formula contains illegal node')

    @staticmethod
    def escape(str):

        # escapes keywords by replacing their first letter with an underscore

        s = 0
        e = 0
        l = len(str)
        q = ''

        str = list(str)

        while True:

            while s < l:
                sc = str[s]
                if sc in '"\'':
                    q = sc
                    break
                if sc not in ' !=><\t\r\n+-,;()':
                    break
                else:
                    s += 1

            e = s + 1

            if e >= l:
                break

            while e < l:
                ec = str[e]
                if ec == q:
                    # skip quoted items
                    q = ''
                    break
                elif q is '' and ec in ' !=><\t\r\n+-,;()':
                    if is_kw(str[s:e]):
                        str[s] = '_'
                    break
                else:
                    e += 1
            else:
                if is_kw(str[s:e]):
                    str[s] = '_'

            s = e + 1

        return ''.join(str)
