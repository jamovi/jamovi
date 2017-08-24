#
# Copyright (C) 2016 Jonathon Love
#

import csv
import math
import re
from io import TextIOWrapper
from ...core import MeasureType
import chardet

import logging

log = logging.getLogger('jamovi')


def write(data, path):

    with open(path, 'w', encoding='utf-8') as file:
        sep = ''
        for column in data.dataset:
            file.write(sep + '"' + column.name + '"')
            sep = ','
        file.write('\n')

        for row_no in range(data.dataset.row_count):
            sep = ''
            for col_no in range(data.dataset.column_count):
                cell = data.dataset[col_no][row_no]
                if isinstance(cell, int) and cell == -2147483648:
                    file.write(sep + '')
                elif isinstance(cell, float) and math.isnan(cell):
                    file.write(sep + '')
                elif isinstance(cell, str):
                    if cell != '':
                        cell = cell.replace('"', '""')
                        cell = '"' + cell + '"'
                    file.write(sep + cell)
                else:
                    file.write(sep + str(cell))
                sep = ','
            file.write('\n')


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


def fix_names(names):
    if len(names) == 0:
        return [ 'X' ]
    for i in range(1, len(names)):
        name = names[i]
        names_used = names[:i - 1]
        orig_name = name
        c = 1
        while name in names_used:
            c += 1
            name = orig_name + ' (' + str(c) + ')'
        names[i] = name
    return names


def read(data, path):

    with open(path, mode='rb') as file:

        byts = file.read(4096)
        det  = chardet.detect(byts)
        encoding = det['encoding']
        file.seek(0)

        if encoding == 'ascii':
            encoding = 'utf-8-sig'

        csvfile = TextIOWrapper(file, encoding=encoding, errors='replace')

        try:
            some_data = csvfile.read(4096)
            if len(some_data) == 4096:  # csv sniffer doesn't like partial lines
                some_data = trim_after_last_newline(some_data)
            dialect = csv.Sniffer().sniff(some_data, ', \t;')
        except csv.Error as e:
            log.exception(e)
            dialect = csv.excel

        csvfile.seek(0)
        reader = csv.reader(csvfile, dialect)

        itr = reader.__iter__()
        column_names = itr.__next__()

        column_count = 0
        column_writers = [ ]

        column_names = fix_names(column_names)

        for i in range(len(column_names)):
            column_name = column_names[i]
            data.dataset.append_column(column_name)
            column = data.dataset[i]
            column_writers.append(ColumnWriter(column, i))
            column_count += 1

        row_count = 0

        csvfile.seek(0)
        reader = csv.reader(csvfile, dialect)
        first = True

        for row in reader:
            if first:
                first = False
            else:
                for i in range(column_count):
                    column_writers[i].examine_row(row)

                row_count += 1

        for column_writer in column_writers:
            column_writer.ruminate()

        data.dataset.set_row_count(row_count)

        csvfile.seek(0)
        reader = csv.reader(csvfile, dialect)
        first = True

        row_no = 0

        for row in reader:
            if first:
                first = False
            else:
                for i in range(column_count):
                    column_writers[i].parse_row(row, row_no)
                row_no += 1


def trim_after_last_newline(text):

    index = text.rfind('\r\n')
    if index == -1:
        index = text.rfind('\n')
        if index == -1:
            index = text.rfind('\r')

    if index != -1:
        text = text[:index]

    return text


class ColumnWriter:

    euro_float_pattern = re.compile(r'^(-)?([0-9]*),([0-9]+)$')
    euro_float_repl = r'\1\2.\3'

    def _is_euro_float(self, v):
        if ColumnWriter.euro_float_pattern.match(v):
            return True
        return False

    def _parse_euro_float(self, v):
        v = re.sub(
            ColumnWriter.euro_float_pattern,
            ColumnWriter.euro_float_repl,
            v)
        return float(v)

    def __init__(self, column, column_index):
        self._column = column
        self._column_index = column_index

        self._only_integers = True
        self._only_floats = True
        self._only_euro_floats = True
        self._is_empty = True
        self._unique_values = set()
        self._measure_type = None
        self._ruminated = False
        self._includes_na = False
        self._dps = 0

    def examine_row(self, row):

        if self._column_index >= len(row):
            return

        value = row[self._column_index]

        if value == 'NA':
            self._includes_na = True
            return

        if value == '' or value == ' ':
            return
        else:
            self._is_empty = False

        self._unique_values.add(value)

        try:
            i = int(value)
            if i > 2147483647 or i < -2147483648:
                self._only_integers = False
        except ValueError:
            self._only_integers = False

            try:
                f = float(value)

                # we always calc dps, even if we know the column isn't going to be
                # continuous. the user might change it *to* continuous later.
                self._dps = max(self._dps, calc_dps(f))
                self._only_euro_floats = False
            except ValueError:
                self._only_floats = False

                if self._only_euro_floats and self._is_euro_float(value):
                    f = self._parse_euro_float(value)
                    self._dps = max(self._dps, calc_dps(f))
                else:
                    self._only_euro_floats = False

    def ruminate(self):

        many_uniques = False
        if len(self._unique_values) >= 49:
            many_uniques = True

        if self._only_integers and many_uniques is False:
            self._measure_type = MeasureType.NOMINAL
            self._unique_values = list(self._unique_values)
            self._unique_values = list(map(lambda x: int(x), self._unique_values))
            self._unique_values.sort()
            for level in self._unique_values:
                self._column.append_level(level, str(level), str(level))
        elif self._only_floats or self._only_euro_floats:
            if self._only_floats and self._only_euro_floats:
                self._only_euro_floats = False
            self._measure_type = MeasureType.CONTINUOUS
        else:
            self._measure_type = MeasureType.NOMINAL_TEXT
            self._unique_values = list(self._unique_values)
            if self._includes_na:
                self._unique_values.append('NA')
            self._unique_values.sort()
            for i in range(0, len(self._unique_values)):
                label = self._unique_values[i]
                self._column.append_level(i, label, label)

        self._ruminated = True
        self._column.measure_type = self._measure_type
        self._column.dps = self._dps

    def parse_row(self, row, row_no):

        if self._ruminated is False:
            self.ruminate()

        if self._column_index >= len(row):
            value = None
        else:
            value = row[self._column_index]

            # we treat NAs as missings, unless it's a text column
            # NA could be an actual value so we play it safe

            if value == 'NA' and self._measure_type != MeasureType.NOMINAL_TEXT:
                value = None
            elif value == '' or value == ' ':
                value = None

        if self._measure_type == MeasureType.NOMINAL or self._measure_type == MeasureType.ORDINAL:
            if value is None:
                self._column[row_no] = -2147483648
            else:
                self._column[row_no] = int(value)

        elif self._measure_type == MeasureType.CONTINUOUS:

            if self._only_euro_floats:
                value = re.sub(
                    ColumnWriter.euro_float_pattern,
                    ColumnWriter.euro_float_repl,
                    value)

            if value is None:
                self._column[row_no] = float('nan')
            else:
                self._column[row_no] = float(value)

        elif self._measure_type == MeasureType.NOMINAL_TEXT:

            if value is None:
                self._column[row_no] = -2147483648
            else:
                self._column[row_no] = self._unique_values.index(value)

        else:
            self._column[row_no] = -2147483648
