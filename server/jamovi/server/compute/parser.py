
import ast
import base64
import re


class Parser:

    _SPECIAL_CHARS = ' ~!@#$%^&*()+=-[]{};,<>?/\\'

    @staticmethod
    def parse(str):

        escaped = Parser.escape(str.strip())  # escape column names
        tree = ast.parse(escaped)

        if len(tree.body) == 0:
            return None

        tree = tree.body[0].value

        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                node.id = Parser.unescape_chunk(node.id)

        return tree

    @staticmethod
    def escape_chunk(chunk):
        if len(chunk) == 0:
            return chunk
        elif chunk == '^':
            return '**'
        elif chunk == 'and':
            return 'and'
        elif chunk == 'or':
            return 'or'
        elif chunk == 'not':
            return 'not'
        elif len(chunk) == 1 and chunk in Parser._SPECIAL_CHARS:
            return chunk
        elif chunk.startswith('"') and chunk.endswith('"'):
            return chunk
        elif re.match(r'^[0-9]*\.?[0-9]+$', chunk):
            return chunk
        else:
            return '_' + base64.b16encode(chunk.encode('utf-8')).decode('utf-8')

    @staticmethod
    def unescape_chunk(chunk):
        if not chunk.startswith('_'):
            raise ValueError()
        chunk = chunk[1:]
        return base64.b16decode(chunk.encode('utf-8')).decode('utf-8')

    @staticmethod
    def escape(str):

        # encodes column names into base16

        s = 0
        e = 0
        n = len(str)
        q = ''

        chunks = list()

        while True:

            while s < n:
                sc = str[s]
                if sc in '"\'`':
                    q = sc
                    break
                if sc not in Parser._SPECIAL_CHARS:
                    break
                else:
                    chunks.append(sc)
                    s += 1

            e = s + 1

            while e < n:
                ec = str[e]
                if ec == q:
                    if q == '`':
                        term = ''.join(str[s + 1:e])
                    else:
                        term = '"' + ''.join(str[s + 1:e]) + '"'
                    chunks.append(term)
                    q = ''
                    break
                elif q is '' and ec in Parser._SPECIAL_CHARS:
                    term = ''.join(str[s:e])
                    chunks.append(term)
                    chunks.append(ec)
                    break
                else:
                    e += 1
            else:
                term = ''.join(str[s:e])
                chunks.append(term)

            if e >= n:
                break

            s = e + 1

        chunks = map(Parser.escape_chunk, chunks)

        return ''.join(chunks)
