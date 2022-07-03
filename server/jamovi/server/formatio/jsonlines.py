
import re
import json
import chardet
import os
import math

from io import TextIOWrapper
from json.decoder import JSONDecodeError

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType

from .reader import Reader


def calc_dps(value, max_dp=3):
    if math.isnan(value):
        return 0
    if not math.isfinite(value):
        return 0

    max_dp_required = 0
    value %= 1
    as_string = '{v:.{dp}f}'.format(v=value, dp=max_dp)
    as_string = as_string[2:]

    for dp in range(max_dp, 0, -1):
        index = dp - 1
        if as_string[index] != '0':
            max_dp_required = dp
            break

    return max_dp_required


class ColumnInfo:

    def __init__(self):
        self.only_integers = True
        self.only_floats = True
        self.is_empty = True
        self.unique_values = set()
        self.n_uniques = 0
        self.many_uniques = False
        self.measure_type = None
        self.data_type = None
        self.levels = None
        self.ruminated = False
        self.dps = 0

    def examine(self, value):
        if value is None or (isinstance(value, str) and value.strip() == ''):
            return
        self.is_empty = False
        if isinstance(value, list) or isinstance(value, dict) or isinstance(value, bool):
            value = json.dumps(value)
        if not self.many_uniques:
            try:
                v = int(value)
            except ValueError:
                v = value
            if v not in self.unique_values:
                self.unique_values.add(v)
                self.n_uniques += 1
                if self.n_uniques > 49:
                    self.many_uniques = True
                    self.unique_values = None
        if isinstance(value, int):
            if value > 2147483647 or value < -2147483648:
                self.only_integers = False
        else:
            if isinstance(value, float):
                self.only_integers = False
                self.dps = max(self.dps, calc_dps(value))
            else:
                self.only_integers = False
                self.only_floats = False

    def ruminate(self):
        if self.only_integers:
            if self.many_uniques is False:
                self.data_type = DataType.INTEGER
                self.measure_type = MeasureType.NOMINAL
                if self.unique_values is not None:
                    if any(map(lambda x: isinstance(x, str), self.unique_values)):
                        uniques = list(set(map(lambda x: str(x), self.unique_values)))
                    else:
                        uniques = list(self.unique_values)
                    uniques.sort()
                    self.levels = list(map(lambda v: (v, str(v), str(v), True), uniques))
            else:
                self.data_type = DataType.INTEGER
                self.measure_type = MeasureType.CONTINUOUS
        else:
            if self.only_floats:
                self.data_type = DataType.DECIMAL
                self.measure_type = MeasureType.CONTINUOUS
            else:
                if self.many_uniques is False:
                    self.data_type = DataType.TEXT
                    self.measure_type = MeasureType.NOMINAL
                    if self.unique_values is not None:
                        if any(map(lambda x: isinstance(x, str), self.unique_values)):
                            uniques = list(set(map(lambda x: str(x), self.unique_values)))
                        else:
                            uniques = list(self.unique_values)
                        uniques.sort()
                        self.levels = list(map(lambda v: (v[0], str(v[1]), str(v[1]), False), enumerate(uniques)))
                else:
                    self.data_type = DataType.TEXT
                    self.measure_type = MeasureType.ID
        self.ruminated = True


class JSONLinesReader(Reader):

    @staticmethod
    def is_this_json(path):

        if path[-4:].lower() == '.csv':
            return False

        with open(path, mode='rb') as file:
            byts = file.read(4096)
            det = chardet.detect(byts)
            encoding = det['encoding']
            file.seek(0)
            if encoding == 'ascii':
                encoding = 'utf-8-sig'
            text_stream = TextIOWrapper(file, encoding=encoding, errors='replace')
            while True:
                line = text_stream.readline()
                if line == '':  # EOF
                    break
                sline = line.strip()
                if sline != '':  # skip empty lines
                    try:
                        v = json.loads(sline)
                        if isinstance(v, list) or isinstance(v, dict):
                            return True
                        else:
                            return False
                    except JSONDecodeError:
                        return False
            return False

    def __init__(self, settings):
        super().__init__(settings)
        self._file = None
        self._text_stream = None

    def open(self, path):
        self.set_total(os.stat(path).st_size)
        try:
            self._file = open(path, mode='rb')
            byts = self._file.read(4096)
            det = chardet.detect(byts)
            encoding = det['encoding']
            self._file.seek(0)
            if encoding == 'ascii':
                encoding = 'utf-8-sig'
            self._text_stream = TextIOWrapper((self._file), encoding=encoding, errors='replace')
        except Exception as e:
            if self._file:
                self._file.close()
            raise e

    def lines(self):
        while True:
            line = self._text_stream.readline()
            if line == '':
                break
            yield line

    def rows(self, line):
        entry = json.loads(line)
        if isinstance(entry, dict):
            yield entry
        elif isinstance(entry, list):
            for row in entry:
                yield row
        else:
            raise ValueError

    def read_into(self, data, path, prog_cb):

        self.open(path)
        infos = {}
        row_count = 0
        line_count = 0

        for line in self.lines():
            for row in self.rows(line):
                for column_name, value in row.items():
                    try:
                        info = infos[column_name]
                    except KeyError:
                        infos[column_name] = info = ColumnInfo()
                    info.examine(value)

                row_count += 1
                if row_count % 100 == 0:
                    prog_cb(0.33333 * self.progress() / self._total)
            line_count += 1

        source_column = None
        if line_count > 1:
            source_column = data.append_column('entry', 'entry')
            source_column.column_type = ColumnType.DATA
            source_column.set_data_type(DataType.INTEGER)
            if line_count > 50:
                source_column.set_measure_type(MeasureType.ID)
            else:
                source_column.set_measure_type(MeasureType.NOMINAL)

        for column_name, info in infos.items():
            info.ruminate()
            column = data.append_column(column_name, column_name)
            column.column_type = ColumnType.DATA
            column.set_data_type(info.data_type)
            column.set_measure_type(info.measure_type)
            column.dps = info.dps
            if info.levels:
                for level in info.levels:
                    column.append_level(level[0], level[1], level[2])

        data.set_row_count(row_count)

        self.close()
        self.open(path)

        row_no = 0
        columns_by_name = dict(map(lambda c: (c.name, c), data))

        for line_no, line in enumerate(self.lines()):
            for row in self.rows(line):

                if source_column:
                    source_column.set_value(row_no, line_no+1)

                for column_name, value in row.items():

                    column = columns_by_name[column_name]

                    if value is None or (isinstance(value, str) and value.strip() == ''):
                        column.clear_at(row_no)
                    elif column.data_type == DataType.INTEGER:
                        column.set_value(row_no, value)
                    elif column.data_type == DataType.DECIMAL:
                        column.set_value(row_no, value)
                    elif type(value) in (dict, list, bool):
                        column.set_value(row_no, json.dumps(value))
                    else:
                        value = str(value).strip()
                        if value == '':
                            column.clear_at(row_no)
                        else:
                            column.set_value(row_no, str(value))

                row_no += 1
                if row_no % 100 == 0:
                    prog_cb(.33333 + .66666 * row_no / row_count)


    def progress(self):
        return self._file.tell()

    def __iter__(self):
        self._text_stream.seek(0)

    def close(self):
        try:
            self._file.close()
        except Exception:
            pass
