
import ast


class Transfudgifier(ast.NodeTransformer):

    def visit_Call(self, node):

        if node.func.id == 'Z' or node.func.id == 'SCALE':

            for kw in node.keywords:
                if kw.arg == 'group_by':
                    kws = [ kw ]
                    break
            else:
                if len(node.args) > 1:
                    kws = [ ast.keyword(arg='group_by', value=node.args[1]) ]
                else:
                    kws = [ ]

            return ast.BinOp(
                left=ast.BinOp(
                    left=node.args[0],
                    op=ast.Sub(),
                    right=ast.Call(
                        func=ast.Name(id='VMEAN', ctx=ast.Load()),
                        args=[ node.args[0] ],
                        keywords=kws)),
                op=ast.Div(),
                right=ast.Call(
                    func=ast.Name(id='VSTDEV', ctx=ast.Load()),
                    args=[ node.args[0] ],
                    keywords=kws))

        elif node.func.id == 'MAXABSZ':

            def zabsify(arg):
                return ast.Call(
                    func=ast.Name(id='ABSZ', ctx=ast.Load()),
                    args=[ arg ],
                    keywords=node.keywords)

            return self.generic_visit(ast.Call(
                func=ast.Name(id='MAX', ctx=ast.Load()),
                args=list(map(zabsify, node.args)),
                keywords=[]))

        elif node.func.id == 'ABSZ':

            return self.generic_visit(ast.Call(
                func=ast.Name(id='ABS', ctx=ast.Load()),
                args=[
                    ast.Call(
                        func=ast.Name(id='Z', ctx=ast.Load()),
                        args=node.args,
                        keywords=node.keywords)],
                keywords=[]))

        else:
            return self.generic_visit(node)
