
import re

from .compute import Parser
from .compute import Checker
from .compute import Messages
from .compute import FormulaStatus

from ast import NodeVisitor


class Transform:

    def __init__(self, dataset):
        self.name = ''
        self.id = 0  # an id of zero is unasigned
        self.description = ''
        self._formula = [ '' ]
        self.formula_message = [ '' ]
        self.colour_index = 0
        self.status = FormulaStatus.EMPTY
        self._dataset = dataset
        self._pieces = [ '1', 'NA' ]
        self._dependencies = set()

    @property
    def formula(self):
        return self._formula

    @formula.setter
    def formula(self, formulas):
        regex = re.compile(r'\s+')
        for i in range(0, len(formulas)):
            formula = formulas[i]
            formula = formula.strip()
            formula = regex.sub(' ', formula)
            formulas[i] = formula
        self._formula = formulas

    @property
    def has_formula(self):
        return len(self.formula) > 0

    @property
    def dependencies(self):
        return self._dependencies

    @property
    def in_error(self):
        return self.status == FormulaStatus.ERROR

    @property
    def dependents(self):
        deps = set()
        for column in self._dataset:
            if self.id == column.transform:
                deps.add(column)
                deps.update(column.dependents)
        return deps

    def parse_formula(self):

        self._dependencies = set()
        self.status = FormulaStatus.OK

        pieces = list(self.formula)  # clone
        self.formula_message = [''] * len(self.formula)

        conds_is = range(0, len(self.formula) - 1, 2)
        thens_is = range(1, len(self.formula) - 1, 2)
        thens_is = list(thens_is)
        thens_is.append(-1)

        to_remove = [ ]

        # check conditions and remove those in error
        for cond_i in conds_is:
            status, depcies, e = self._parse_cond(cond_i)
            if status == FormulaStatus.EMPTY:
                to_remove.append(cond_i)
                to_remove.append(cond_i + 1)
            elif status == FormulaStatus.ERROR:
                self.formula_message[cond_i] = Messages.create_from(e)
                to_remove.append(cond_i)
                to_remove.append(cond_i + 1)
                self.status = FormulaStatus.ERROR
            else:
                self._dependencies.update(depcies)

        # check 'thens', and replace with 'NA' if error
        for then_i in thens_is:
            status, depcies, e = self._parse_then(then_i)
            if status == FormulaStatus.ERROR:
                self.formula_message[then_i] = Messages.create_from(e)
                pieces[then_i] = 'NA'
                self.status = FormulaStatus.ERROR
            elif status == FormulaStatus.EMPTY:
                pieces[then_i] = 'NA'
            else:
                self._dependencies.update(depcies)

        # perform the removal
        offset = 0
        for i in to_remove:
            pieces.pop(i - offset)
            offset += 1

        # insert the 'true' for the final if-else
        pieces.insert(-1, '1')

        # these pieces are then used to produce a formula for each column
        self._pieces = pieces

    def produce_formula(self, parent):
        # produce a recode formula for the parent
        pieces = list(self._pieces)
        name = '`' + parent.name + '`'
        for i in range(0, len(pieces) - 2, 2):
            pieces[i] = name + ' ' + pieces[i]
        return 'RECODE(' + name + ',' + ','.join(pieces) + ')'

    def _parse_cond(self, i):
        cond = self.formula[i].strip()
        if cond == '':
            return (FormulaStatus.EMPTY, [], None)
        cond = '$source ' + cond
        try:
            node = Parser.parse(cond)
            Checker.check(node, dataset=self._dataset)
            depcies = self._get_node_depcies(node)
            return (FormulaStatus.OK, depcies, None)
        except BaseException as e:
            return (FormulaStatus.ERROR, [], e)

    def _parse_then(self, i):
        then = self.formula[i].strip()
        if then == '':
            return (FormulaStatus.EMPTY, [], None)
        try:
            node = Parser.parse(then)
            Checker.check(node, dataset=self._dataset)
            depcies = self._get_node_depcies(node)
            return (FormulaStatus.OK, depcies, None)
        except BaseException as e:
            return (FormulaStatus.ERROR, [], e)

    def _get_node_depcies(self, node):
        res = Transform.DependencyResolver()
        res.visit(node)
        columns = map(lambda name: self._dataset[name], res.columns)
        return columns

    class DependencyResolver(NodeVisitor):

        def __init__(self):
            self._columns = set()

        @property
        def columns(self):
            return self._columns

        def visit_Name(self, node):
            if node.id != 'NA' and node.id != '$source':
                self._columns.add(node.id)

        def visit_Call(self, node):
            # we deliberately don't visit the Call name, so we can
            # assume that calls to visit_Call are function names
            for arg in node.args:
                self.generic_visit(arg)
