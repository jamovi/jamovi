
import csv


class CSVParser:

    def __init__(self):
        self._result = None
        self._trim_empty_last_line = True

    def result(self):
        return self._result

    def close(self):
        pass

    def feed(self, data):
        try:
            dialect = csv.Sniffer().sniff(data, ',\t;')
        except csv.Error:
            dialect = csv.excel

        data = data.replace('\r\n', '\n')  # normalize line endings
        data = data.replace('\r', '\n')
        lines = data.split('\n')
        if self._trim_empty_last_line and lines[-1] == '':
            del lines[-1]

        if len(lines) == 0:
            self._result = [ ]
            return

        row = csv.reader(lines, dialect).__iter__().__next__()
        n_cols = len(row)
        n_rows = len(lines)

        cells = [None] * n_cols
        for i in range(n_cols):
            cells[i] = [''] * n_rows

        row_no = 0
        for row in csv.reader(lines, dialect):
            n = min(len(row), n_cols)
            for col_no in range(n):
                value = row[col_no]
                try:
                    value = int(value)
                except:
                    try:
                        value = float(value)
                    except:
                        pass
                if isinstance(value, str):
                    value = value.strip()
                cells[col_no][row_no] = value
            row_no += 1

        self._result = cells
