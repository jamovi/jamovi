
import ast
import base64
import re


class Parser:

    _SPECIAL_CHARS = ' ~!@#$%^&*()+=-[]{};,<>?/\\'

    @staticmethod
    def parse(str):

        escaped = Parser.escape(str)  # escape keywords
        tree = ast.parse(escaped)

        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                node.id = Parser.unescape_chunk(node.id)

        return tree

    @staticmethod
    def escape_chunk(chunk):
        if len(chunk) == 0:
            return chunk
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

        # escapes keywords by replacing their first letter with an underscore

        s = 0
        e = 0
        l = len(str)
        q = ''

        chunks = list()

        while True:

            while s < l:
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

            while e < l:
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

            if e >= l:
                break

            s = e + 1

        chunks = map(Parser.escape_chunk, chunks)

        return ''.join(chunks)
