

from .compute import Parser
from .compute import FormulaStatus


class Transform:

    def __init__(self):
        self.name = ''
        self.id = 0  # an id of zero is unasigned
        self.description = ''
        self.formula = [ '' ]
        self.formula_message = [ '' ]
        self._pieces = [ '1', 'NA' ]

    def parse_formula(self):

        pieces = list(self.formula)  # clone
        self.formula_message = [''] * len(self.formula)

        conds_is = range(0, len(self.formula) - 1, 2)
        thens_is = range(1, len(self.formula) - 1, 2)
        thens_is = list(thens_is)
        thens_is.append(-1)

        to_remove = [ ]

        # check conditions and remove those in error
        for cond_i in conds_is:
            status, e = self._parse_cond(cond_i)
            if status == FormulaStatus.EMPTY:
                to_remove.append(cond_i)
                to_remove.append(cond_i + 1)
            elif status == FormulaStatus.ERROR:
                self.formula_message[cond_i] = str(e)
                to_remove.append(cond_i)
                to_remove.append(cond_i + 1)

        # check 'thens', and replace with 'NA' if error
        for then_i in thens_is:
            status, e = self._parse_then(then_i)
            if status == FormulaStatus.ERROR:
                self.formula_message[then_i] = str(e)
                pieces[then_i] = 'NA'
            elif status == FormulaStatus.EMPTY:
                pieces[then_i] = 'NA'

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
        name = '`' + parent.name + '`'
        pieces = list(self._pieces)
        for i in range(0, len(pieces) - 2, 2):
            pieces[i] = name + ' ' + pieces[i]
        return 'RECODE(' + name + ',' + ','.join(pieces) + ')'

    def _parse_cond(self, i):
        cond = self.formula[i].strip()
        if cond == '':
            return (FormulaStatus.EMPTY, None)
        cond = 'x ' + cond
        try:
            Parser.parse(cond)
        except Exception as e:
            return (FormulaStatus.ERROR, e)
        return (FormulaStatus.OK, None)

    def _parse_then(self, i):
        then = self.formula[i].strip()
        if then == '':
            return (FormulaStatus.EMPTY, None)
        try:
            Parser.parse(then)
        except Exception as e:
            return (FormulaStatus.ERROR, e)
        return (FormulaStatus.OK, None)

    @property
    def has_formula(self):
        return len(self.formula) > 0
