
import csv

from typing import Literal

from . import utils


class CSVParser:

    _dec_symbol: Literal['.', ',']

    def __init__(self, dec_symbol: Literal['.', ',']):
        self._dec_symbol = dec_symbol
        self._result = None
        self._trim_empty_last_line = True

    def result(self):
        return self._result

    def close(self):
        pass

    def feed(self, data):
        try:
            dialect = csv.Sniffer().sniff(data, ',\t;')
            if self._dec_symbol == ',' and dialect.delimiter ==',':
                number = utils.parse_number(data, self._dec_symbol)
                if isinstance(number, (int, float)):
                    dialect.delimiter = ';'
        except csv.Error:
            dialect = csv.excel
            if self._dec_symbol == ',':
                dialect.delimiter = ';'

        data = data.replace('\r\n', '\n')  # normalize line endings
        data = data.replace('\r', '\n')
        lines = data.split('\n')
        if self._trim_empty_last_line and lines[-1] == '':
            del lines[-1]

        if len(lines) == 0:
            self._result = [ ]
            return

        n_rows = len(lines)
        n_cols = 1
        for row in csv.reader(lines, dialect):
            n_cols = max(n_cols, len(row))

        cells = [None] * n_cols
        for i in range(n_cols):
            cells[i] = [''] * n_rows

        row_no = 0
        for row in csv.reader(lines, dialect):
            n = min(len(row), n_cols)
            for col_no in range(n):
                value = row[col_no]
                cells[col_no][row_no] = utils.parse_number(value, self._dec_symbol)
            row_no += 1

        self._result = cells
