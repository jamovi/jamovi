
from enum import Enum
from html.parser import HTMLParser as Parser


class HTMLParser(Parser):

    class HTMLType(Enum):
        UNKNOWN = 0
        TABLE = 1
        PARA = 2

    def __init__(self):
        Parser.__init__(self)
        self._result = None
        self._current_row = None
        self._current_cell = None
        self._rows = [ ]
        self._type = HTMLParser.HTMLType.UNKNOWN
        self._span = 1

    def result(self):
        return self._result

    def close(self):

        if self._type is HTMLParser.HTMLType.TABLE:

            if self._current_row is not None:
                self._rows.append(self._current_row)

            n_rows = len(self._rows)
            n_cols = 0
            if len(self._rows) > 0:
                n_cols = max(map(len, self._rows))

            self._result = [None] * n_cols
            for i in range(n_cols):
                self._result[i] = [None] * n_rows

            for row_no in range(n_rows):
                row = self._rows[row_no]
                for col_no in range(len(row)):
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
                    self._result[col_no][row_no] = value
        else:
            content = self._current_cell
            content = content.replace('\r\n', ' ')
            content = content.replace('\r', ' ')
            content = content.replace('\n', ' ')
            self._result = [ [ content ] ]

    def handle_data(self, data):
        if self._current_cell is not None:
            self._current_cell += data

    def handle_starttag(self, tag, attrs):

        if self._type is HTMLParser.HTMLType.UNKNOWN:
            if tag == 'table' or tag == 'tr' or tag == 'td' or tag == 'th':
                self._type = HTMLParser.HTMLType.TABLE
            elif tag == 'p' or tag == 'span':
                self._type = HTMLParser.HTMLType.PARA
                if self._current_cell is None:
                    self._current_cell = ''

        if self._type is HTMLParser.HTMLType.TABLE:

            if tag == 'tr':
                self._finalise_cell()
                if self._current_row is not None:
                    self._rows.append(self._current_row)
                self._current_row = [ ]

            elif tag == 'td' or tag == 'th':
                span = self._get_span(attrs)
                self._add_cell(span)

    def handle_endtag(self, tag):
        if self._type is HTMLParser.HTMLType.TABLE:
            if tag == 'td' or tag == 'th':
                self._finalise_cell()

    def handle_startendtag(self, tag, attrs):
        if self._type is HTMLParser.HTMLType.TABLE:
            if tag == 'td' or tag == 'th':
                span = self._get_span(attrs)
                self._add_cell(span)
                self._finalise_cell()

    def unknown_decl(self, data):
        pass

    def _get_span(self, attrs):
        for attr in attrs:
            if attr[0] == 'colspan':
                try:
                    return int(attr[1])
                except:
                    return 1
        return 1

    def _add_cell(self, span=1):
        if self._current_row is None:
            self._current_row = [ ]
        self._current_cell = ''
        self._current_span = span

    def _finalise_cell(self):
        if self._current_cell is not None:
            self._current_row.append(self._current_cell)
            for i in range(1, self._current_span):
                self._current_row.append(None)
            self._current_cell = None
