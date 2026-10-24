
# the computation of a computed column's, recoded column's or filter's values
# from its formula (see Column.recalc()), a chunk of rows at a time. how the
# formula itself is evaluated is described at the top of chunks.py

import ast

import numpy as np

from jamovi.server.dataset.enums import DataType
from jamovi.server.dataset.enums import MeasureType

from .typevalues import convert
from .chunks import convert_chunk
from .chunks import RowError
from .chunks import Chunk
from .chunks import INT_MISSING
from .chunks import NotVectorisable


NaN = float('nan')

# functions whose values for a row depend on other rows (or on chance), so
# a column using them computes all of its rows again
ROW_DEPENDENT_FUNCTIONS = { 'OFFSET', 'UNIF', 'NORM', 'BETA', 'GAMMA', 'SAMPLE' }


def can_recalc_rows(column, node) -> bool:
    """whether some of a column's rows can be computed again, and the others
    keep their values: the formula reads only each row's own values (no
    column-wise functions, OFFSET() or random functions), and the column has
    no levels (which a recalc of the whole column would redo)"""
    if node is None or column.is_filter:
        return False
    if column.measure_type is not MeasureType.CONTINUOUS or column.has_levels:
        return False
    if column.uses_column_formula:
        return False
    for n in ast.walk(node):
        if isinstance(n, ast.Call) and n.func.id in ROW_DEPENDENT_FUNCTIONS:
            return False
    return True


class Computation:
    """one computation of some of a column's rows"""

    # formulas are evaluated (and written) this many rows at a time
    CHUNK_SIZE = 100_000

    def __init__(self, column, child, node, model):
        self._column = column
        self._child = child
        self._node = node
        self._model = model

        if column.data_type is DataType.DECIMAL:
            self._ul_type = float
        elif column.data_type is DataType.TEXT:
            self._ul_type = str
        else:
            self._ul_type = int

        if not column.is_filter:
            self._missing = convert(NaN, self._ul_type)
        else:
            self._missing = 1  # a filter keeps rows it can't evaluate

        # column-wise formulas don't see (and leave missing) filtered rows
        self._filt = not column.is_filter and column.uses_column_formula

    @property
    def column(self):
        return self._column

    def run(self, ranges):
        """compute these (start, end) ranges of rows"""
        column = self._column
        child = self._child

        child.clear_levels()

        if self._node is not None and self._node.has_levels:
            for level in self._node.get_levels(column.row_count, column.uses_column_formula):
                child.append_level(level[0], level[1])

        if self._node is None:
            for start, end in ranges:
                for chunk_start in range(start, end, Computation.CHUNK_SIZE):
                    chunk_end = min(chunk_start + Computation.CHUNK_SIZE, end)
                    values = [ self._missing ] * (chunk_end - chunk_start)
                    child.set_values(chunk_start, values, True)
        else:
            with self._model.recalc_reads():
                for start, end in ranges:
                    self._recalc_chunks(start, end)
            if ranges == [ (0, column.row_count) ]:
                column.determine_dps()
            else:
                self._determine_dps_of(ranges)

    def _recalc_chunks(self, start, end):
        row_count = self._column.row_count
        for chunk_start in range(start, end, Computation.CHUNK_SIZE):
            chunk_end = min(chunk_start + Computation.CHUNK_SIZE, end)
            values = self._node.fchunk(chunk_start, chunk_end, row_count, self._filt)
            values, n_errors = self._column_values(values)
            if n_errors > 0:
                self._model._log.error(
                    "'%s' could not be evaluated for %s rows", self._column.name, n_errors)
            if self._filt:
                filtered = self._model.filtered_rows(chunk_start, chunk_end)
                for i in np.flatnonzero(filtered).tolist():
                    values[i] = self._missing
            self._child.set_values(chunk_start, values, True)

    def _column_values(self, values):
        # a chunk's values converted for the column, with rows that failed
        # (or are too large for an integer column) missing, and how many
        # failed (rows that raised are logged)
        ul_type = self._ul_type
        missing = self._missing

        if isinstance(values, Chunk) and ul_type is not str:
            try:
                chunk = values.as_float() if ul_type is float else values.as_int()
            except NotVectorisable:
                pass
            else:
                array = chunk.values
                bad = chunk.errors
                if ul_type is int:
                    too_large = (array != INT_MISSING) & (np.abs(array) > 2147483647)
                    bad = too_large if bad is None else (bad | too_large)
                if bad is None or not bad.any():
                    return array.tolist(), 0
                array = array.copy()
                array[bad] = missing if ul_type is int else np.nan
                return array.tolist(), int(np.sum(bad))

        values = convert_chunk(values, ul_type)
        n_errors = 0
        for i, v in enumerate(values):
            if isinstance(v, RowError):
                values[i] = missing
                if v.exception is not None:
                    self._model._log.error(v.exception, exc_info=v.exception)
                else:
                    n_errors += 1
            elif ul_type is int and not -2147483648 <= v <= 2147483647:
                values[i] = missing  # too large for the column
                n_errors += 1
        return values, n_errors

    def _determine_dps_of(self, ranges):
        # as determine_dps(), after only these rows have changed: the dps
        # were the most of any row's, so if these rows have as many or more,
        # it's theirs; otherwise another row may have had the most
        column = self._column
        how_many_dps = getattr(self._child, 'how_many_dps', None)
        if column.data_type is not DataType.DECIMAL or how_many_dps is None:
            column.determine_dps()
            return
        dps = 0
        for start, end in ranges:
            for row_no in range(start, end):
                dps = max(dps, how_many_dps(self._child.get_value(row_no), 3))
        if dps >= column.dps:
            column.dps = dps
        else:
            column.determine_dps()
