
import ast

from jamovi.core import ColumnType
from jamovi.core import MeasureType

from .compute import Parser
from .compute import FormulaStatus
from .compute import Transmogrifier
from .compute import Checker

from .utils import FValues
from .utils import convert
from .utils import is_missing


NaN = float('nan')


class Column:

    def __init__(self, parent, child=None):
        self._parent = parent
        self._child = child
        self._id = -1
        self._index = -1

        self._node = None
        self._fields = ('name',)  # for AST compatibility
        self._node_parents = [ ]
        self._needs_recalc = False
        self._formula_status = FormulaStatus.EMPTY

    def _create_child(self):
        if self._child is None:
            self._parent._realise_column(self)

    def __setitem__(self, index, value):
        if self._child is None:
            self._create_child()
        self._child[index] = value

    def __getitem__(self, index):
        if self._child is not None:
            return self._child[index]
        elif self._child.measure_type is MeasureType.NOMINAL_TEXT:
            return ''
        elif self._child.measure_type is MeasureType.CONTINUOUS:
            return NaN
        else:
            return -2147483648

    def fvalue(self, index):
        if self._child is not None:
            v = self._child[index]
            if (self._child.measure_type is MeasureType.NOMINAL or
               self._child.measure_type is MeasureType.ORDINAL):
                if is_missing(v):
                    return (-2147483648, '')
                else:
                    return (v, self._child.get_label(v))
            else:
                return v
        else:
            if self._child.measure_type is MeasureType.CONTINUOUS:
                return NaN
            elif self._child.measure_type is MeasureType.NOMINAL_TEXT:
                return ''
            else:
                return (-2147483648, '')

    def fvalues(self):
        return FValues(self)

    def is_atomic_node(self):
        return False

    @property
    def is_virtual(self):
        return self._child is None

    def realise(self):
        self._create_child()

    @property
    def id(self):
        if self._child is not None:
            return self._child.id
        return self._id

    @id.setter
    def id(self, id):
        self._id = id
        if self._child is not None:
            self._child.id = id

    @property
    def index(self):
        return self._index

    @index.setter
    def index(self, index):
        self._index = index

    @property
    def name(self):
        if self._child is not None:
            return self._child.name
        return ''

    @name.setter
    def name(self, name):
        if self._child is None:
            self._create_child()
        self._child.name = name

    @property
    def import_name(self):
        if self._child is not None:
            return self._child.import_name
        return ''

    @property
    def column_type(self):
        if self._child is not None:
            return self._child.column_type
        return ColumnType.NONE

    @column_type.setter
    def column_type(self, column_type):
        if self._child is None:
            self._create_child()
        self._child.column_type = column_type

    @property
    def measure_type(self):
        if self._child is not None:
            return self._child.measure_type
        return MeasureType.NONE

    @measure_type.setter
    def measure_type(self, measure_type):
        if self._child is None:
            self._create_child()
        self._child.measure_type = measure_type

    @property
    def auto_measure(self):
        if self._child is not None:
            return self._child.auto_measure
        return True

    @auto_measure.setter
    def auto_measure(self, auto):
        if self._child is None:
            self._create_child()
        self._child.auto_measure = auto

    @property
    def dps(self):
        if self._child is not None:
            return self._child.dps
        return 0

    @dps.setter
    def dps(self, dps):
        if self._child is None:
            self._create_child()
        self._child.dps = dps

    @property
    def formula(self):
        if self._child is not None:
            return self._child.formula
        return ''

    @property
    def formula_message(self):
        if self._child is not None:
            return self._child.formula_message
        return ''

    @property
    def has_formula(self):
        return self.formula != ''

    def determine_dps(self):
        if self._child is not None:
            self._child.determine_dps()

    def append(self, value):
        if self._child is None:
            self._create_child()
        self._child.append(value)

    def insert_level(self, raw, label, importValue=None):
        if self._child is None:
            self._create_child()
        self._child.insert_level(raw, label, importValue)

    def get_label(self, value):
        if self._child is None:
            raise RuntimeError('Virtual columns have no labels')
        return self._child.get_label(value)

    def get_value_for_label(self, label):
        if self._child is not None:
            return self._child.get_value_for_label(label)
        else:
            return -2147483648

    def clear_levels(self):
        if self._child is None:
            self._create_child()
        self._child.clear_levels()

    @property
    def has_levels(self):
        if self._child is not None:
            return self._child.has_levels
        return False

    @property
    def level_count(self):
        if self._child is not None:
            return self._child.level_count
        return 0

    def has_level(self, index_or_name):
        if self._child is not None:
            return self._child.has_level(index_or_name)
        return False

    @property
    def levels(self):
        if self._child is not None:
            return self._child.levels
        return []

    @property
    def row_count(self):
        if self._child is not None:
            return self._child.row_count
        return 0

    @property
    def changes(self):
        if self._child is not None:
            return self._child.changes
        return False

    def clear_at(self, index):
        if self._child is None:
            self._create_child()
        self._child.clear_at(index)

    def __iter__(self):
        if self._child is None:
            self._create_child()
        return self._child.__iter__()

    def raw(self, index):
        if self._child is not None:
            return self._child.raw(index)
        return -2147483648

    def change(self,
               name=None,
               column_type=None,
               measure_type=None,
               levels=None,
               dps=None,
               auto_measure=None,
               formula=None):

        if self._child is None:
            self._create_child()

        formula_change = False
        if formula is not None:
            if formula != self._child.formula:
                formula_change = True

        if formula_change:
            self._child.change(formula=formula)
            self.parse_formula()
        else:
            self._child.change(
                name=name,
                column_type=column_type,
                measure_type=measure_type,
                levels=levels,
                dps=dps,
                auto_measure=auto_measure,
                formula=formula)

    @property
    def has_deps(self):
        return len(self.dependencies) != 0 or len(self.dependents) != 0

    @property
    def dependencies(self):
        rer = Column.DependencyResolver()
        rer.visit(self)
        return rer.columns

    @property
    def dependents(self):
        rer = Column.DependentResolver()
        rer.visit(self)
        return rer.columns

    @property
    def needs_recalc(self):
        if self.column_type is not ColumnType.COMPUTED:
            return False
        else:
            return self._needs_recalc

    @needs_recalc.setter
    def needs_recalc(self, needs_recalc: bool):
        for parent in self._node_parents:
            parent.needs_recalc = needs_recalc
        if self.column_type is ColumnType.COMPUTED:
            self._needs_recalc = needs_recalc

    def recalc(self, start=None, end=None):

        if not self.needs_recalc:
            return

        for dep in self.dependencies:
            if dep.needs_recalc:
                dep.recalc()

        if start is None:
            start = 0
            end = self.row_count
        elif end is None:
            end = start + 1

        self._child.clear_levels()

        if self._node is not None and self._node.has_levels:
            for level in self._node.levels:
                self._child.append_level(level[0], level[1])

        if self.measure_type is MeasureType.CONTINUOUS:
            ul_type = float
        elif self.measure_type is MeasureType.NOMINAL_TEXT:
            ul_type = str
        else:
            ul_type = int

        if self._node is None:
            v = convert(NaN, ul_type)
            for row_no in range(start, end):
                self._child.set_value(row_no, v, True)
        else:
            for row_no in range(start, end):
                try:
                    v = self._node.fvalue(row_no)
                    v = convert(v, ul_type)
                except Exception as e:
                    v = convert(NaN, ul_type)
                    self._parent._log.exception(e)
                self._child.set_value(row_no, v, True)
            self.determine_dps()

        self._needs_recalc = False

    def parse_formula(self):
        try:

            dataset = self._parent

            if self._formula_status is FormulaStatus.OK:
                self._node._remove_node_parent(self)
                self._node = None

            node = Parser.parse(self.formula)
            self._child.formula_message = ''

            if node is None:
                self._formula_status = FormulaStatus.EMPTY
            else:
                Checker.check(self, node)
                node = Transmogrifier(dataset).visit(node)
                self._node = node
                self._node._add_node_parent(self)
                self._formula_status = FormulaStatus.OK

                self._child.set_measure_type(self._node.measure_type)

        except RecursionError:
            self._formula_status = FormulaStatus.ERROR
            self._child.formula_message = 'Circular reference detected'
        except SyntaxError:
            self._formula_status = FormulaStatus.ERROR
            self._child.formula_message = 'The formula is mis-specified'
        except (NameError, TypeError, ValueError) as e:
            self._formula_status = FormulaStatus.ERROR
            self._child.formula_message = str(e)
        except BaseException as e:
            self._formula_status = FormulaStatus.ERROR
            self._child.formula_message = 'Unexpected error ({}, {})'.format(str(e), type(e).__name__)
            # import traceback
            # print(traceback.format_exc())

    def _add_node_parent(self, parent):
        self._node_parents.append(parent)

    def _remove_node_parent(self, parent):
        self._node_parents.remove(parent)

    class DependentResolver:

        def __init__(self):
            self._columns = set()

        def visit(self, node):
            for parent in node._node_parents:
                if isinstance(parent, Column):
                    self._columns.add(parent)
                    for grand_parent in parent._node_parents:
                        self.visit(grand_parent)
                else:
                    self.visit(parent)

        @property
        def columns(self):
            return self._columns

    class DependencyResolver(ast.NodeVisitor):

        def __init__(self):
            self._first = True
            self._columns = set()

        def visit(self, node):
            if self._first and isinstance(node, Column):
                self._first = False
                if node._node is None:
                    return
                else:
                    return self.visit(node._node)
            else:
                return ast.NodeVisitor.visit(self, node)

        def visit_Column(self, column):
            self._columns.add(column)
            if column._node is not None:
                self.visit(column._node)

        def visit_BinOp(self, node):
            self.visit(node.left)
            self.visit(node.right)

        def visit_UnaryOp(self, node):
            self.visit(node.operand)

        def visit_Call(self, node):
            for arg in node.args:
                self.visit(arg)

        @property
        def columns(self):
            return self._columns
