
from openpyxl import load_workbook

from .reader import Reader
from .exceptions import FileCorruptError

from datetime import datetime


def get_readers():
    return [ ( 'xlsx', read ) ]


def read(data, path, prog_cb):

    reader = XLSXReader()
    reader.read_into(data, path, prog_cb)


def to_string(value):
    if value is None:
        return ''
    if isinstance(value, datetime):
        if value.hour == 0 and value.minute == 0 and value.second == 0:
            return value.date().isoformat()
        else:
            return str(value)
    else:
        return str(value)


class XLSXReader(Reader):

    def __init__(self):
        Reader.__init__(self)
        self._ws = None
        self._ws_iter = None
        self._row_no = 0

    def open(self, path):
        wb = load_workbook(filename=path, read_only=True, data_only=True)
        self._ws = wb.active

        if self._ws is None:
            raise FileCorruptError

        self.set_total(self._ws.max_row - self._ws.min_row + 1)

        if 1 == self._ws.min_row == self._ws.min_column == self._ws.max_row == self._ws.max_column:

            # qualtrics doesn't set these values correctly,
            # so we have to determine them.

            self._first_col = 0
            self._last_col = 0
            self._first_row = 0
            self._last_row = 0

            values = self._ws.iter_rows(
                min_row=1,
                min_col=1,
                max_row=1048576,  # apparently openpyxl only reads as many rows as there are
                max_col=1000,
                values_only=True)

            for row_no, row in enumerate(values):
                for col_no, value in enumerate(row):
                    if value is not None:
                        self._first_col = min(col_no, self._first_col)
                        self._last_col = max(col_no, self._last_col)
                        self._first_row = min(row_no, self._first_row)
                        self._last_row = row_no

        else:
            self._first_row = self._ws.min_row - 1
            self._first_col = self._ws.min_column - 1
            self._last_row = self._ws.max_row - 1
            self._last_col = self._ws.max_column - 1

        self._row_count = self._last_row - self._first_row + 1
        self._col_count = self._last_col - self._first_col + 1

    def close(self):
        self._ws = None
        self._ws_iter = None

    def progress(self):
        return self._row_no

    def __iter__(self):
        self._row_no = 0
        self._ws_iter = self._ws.iter_rows(
            min_row=self._first_row + 1,
            min_col=self._first_col + 1,
            max_row=self._last_row + 1,
            max_col=self._last_col + 1,
            values_only=True).__iter__()
        return self

    def __next__(self):
        self._row_no += 1
        values = self._ws_iter.__next__()
        values = list(map(to_string, values))
        return values
