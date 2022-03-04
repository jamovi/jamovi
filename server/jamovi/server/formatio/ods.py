
from ezodf import opendoc

from .reader import Reader

from itertools import islice


def get_readers():
    return [ ( 'ods', read ) ]


def read(data, path, prog_cb, *, settings, **kwargs):

    reader = ODSReader(settings)
    reader.read_into(data, path, prog_cb)


def to_string(cell):
    value = cell.value
    if value is None:
        return ''
    else:
        return str(value)


class ODSReader(Reader):

    def __init__(self, settings):
        super().__init__(settings)
        self._sheet = None
        self._sheet_iter = None
        self._row_no = 0
        self._row_count = 0

    def open(self, path):
        doc = opendoc(path)
        self._sheet = doc.sheets[0]

        for row_no in range(0, self._sheet.nrows()):
            for col_no in range(0, self._sheet.ncols()):
                if self._sheet[row_no, col_no].value is not None:
                    break
            else:
                continue
            break

        self._first_row = row_no

        for row_no in range(self._sheet.nrows() - 1, -1, -1):
            for col_no in range(0, self._sheet.ncols()):
                if self._sheet[row_no, col_no].value is not None:
                    break
            else:
                continue
            break

        self._last_row = row_no

        for col_no in range(0, self._sheet.ncols()):
            for row_no in range(0, self._sheet.nrows()):
                if self._sheet[row_no, col_no].value is not None:
                    break
            else:
                continue
            break

        self._first_col = col_no

        for col_no in range(self._sheet.ncols() - 1, -1, -1):
            for row_no in range(0, self._sheet.nrows()):
                if self._sheet[row_no, col_no].value is not None:
                    break
            else:
                continue
            break

        self._last_col = col_no

        self._row_count = self._last_row - self._first_row + 1
        self._col_count = self._last_col - self._first_col + 1

        self.set_total(self._row_count)

    def close(self):
        self._sheet = None

    def progress(self):
        return self._row_no

    def __iter__(self):
        self._row_no = 0
        rows = self._sheet.rows()
        rows = islice(rows, self._first_row, self._last_row + 1)
        self._sheet_iter = rows.__iter__()
        return self

    def __next__(self):
        values = self._sheet_iter.__next__()
        values = islice(values, self._first_col, self._last_col + 1)
        values = map(to_string, values)
        values = list(values)
        self._row_no += 1
        return values
