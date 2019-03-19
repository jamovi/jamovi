
import ast
import copy


class Transfudgifier(ast.NodeTransformer):

    def visit_Call(self, node):

        if node.func.id == 'Z' or node.func.id == 'SCALE':

            for kw in node.keywords:
                if kw.arg == 'group_by':
                    keywords_one = [ kw ]
                    keywords_two = [ copy.deepcopy(kw) ]
                    break
            else:
                keywords_one = [ ]
                keywords_two = [ ]

            return ast.BinOp(
                left=ast.BinOp(
                    left=copy.deepcopy(node.args[0]),
                    op=ast.Sub(),
                    right=ast.Call(
                        func=ast.Name(id='VMEAN', ctx=ast.Load()),
                        args=[ copy.deepcopy(node.args[0]) ],
                        keywords=keywords_one)),
                op=ast.Div(),
                right=ast.Call(
                    func=ast.Name(id='VSTDEV', ctx=ast.Load()),
                    args=[ copy.deepcopy(node.args[0]) ],
                    keywords=keywords_two))
        else:
            return self.generic_visit(node)
