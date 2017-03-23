
import csv


class CSVParser:

    @staticmethod
    def parse(text):
        try:
            dialect = csv.Sniffer().sniff(text, ', \t;')
        except csv.Error:
            dialect = csv.excel

        text = text.replace('\r\n', '\n')  # normalize line endings
        text = text.replace('\r', '\n')
        lines = text.split('\n')
        lines = list(filter(lambda x: x != '', lines))  # remove empty lines

        if len(lines) == 0:
            return [ ]

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

        return cells
