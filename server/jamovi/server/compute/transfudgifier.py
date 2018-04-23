
import ast
import copy


class Transfudgifier(ast.NodeTransformer):

    def visit_Call(self, node):

        if node.func.id == 'Z' or node.func.id == 'SCALE':
            return ast.BinOp(
                left=ast.BinOp(
                    left=copy.deepcopy(node.args[0]),
                    op=ast.Sub(),
                    right=ast.Call(
                        func=ast.Name(id='VMEAN', ctx=ast.Load()),
                        args=[ copy.deepcopy(node.args[0]) ],
                        keywords=[ ])),
                op=ast.Div(),
                right=ast.Call(
                    func=ast.Name(id='VSTDEV', ctx=ast.Load()),
                    args=[ copy.deepcopy(node.args[0]) ],
                    keywords=[ ]))

        return node
