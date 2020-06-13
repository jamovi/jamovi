#
# Copyright (C) 2016-2019 Jonathon Love
#

import os
import csv
import math
from io import TextIOWrapper
import chardet
import logging

from .reader import Reader


log = logging.getLogger('jamovi')


def get_readers():
    return [ ( 'csv', read ), ( 'tsv', read ), ( 'txt', read ) ]


def get_writers():
    return [ ( 'csv', write ), ( 'txt', write ) ]


def read(data, path, prog_cb):

    reader = CSVReader()
    reader.read_into(data, path, prog_cb)


def write(data, path, prog_cb):

    with open(path, 'w', encoding='utf-8') as file:
        sep = ''
        for column in data:
            if column.is_virtual or (column.is_filter and column.active):
                continue
            file.write(sep + '"' + column.name + '"')
            sep = ','
        file.write('\n')

        for row_no in range(data.row_count):
            if data.is_row_filtered(row_no):
                continue
            sep = ''
            for column in data:
                if column.is_virtual or (column.is_filter and column.active):
                    continue
                col_no = column.index
                cell = data[col_no][row_no]
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

            if row_no % 1000 == 0:
                prog_cb(row_no / data.row_count)


class CSVReader(Reader):

    def __init__(self):
        Reader.__init__(self)
        self._file = None
        self._text_stream = None

    def open(self, path):

        self.set_total(os.stat(path).st_size)

        try:
            self._file = open(path, mode='rb')

            byts = self._file.read(4096)
            det  = chardet.detect(byts)
            encoding = det['encoding']
            self._file.seek(0)

            if encoding == 'ascii':
                encoding = 'utf-8-sig'

            self._text_stream = TextIOWrapper(self._file, encoding=encoding, errors='replace')

            try:
                some_data = self._text_stream.read(131072)
                if len(some_data) == 131072:  # csv sniffer doesn't like partial lines
                    some_data = trim_after_last_newline(some_data)
                self._dialect = csv.Sniffer().sniff(some_data, ', \t;')
            except csv.Error as e:
                log.exception(e)
                self._dialect = csv.excel

            self._dialect.doublequote = True
        except Exception as e:
            if self._file:
                self._file.close()
            raise e

    def progress(self):
        return self._file.tell()

    def __iter__(self):
        self._text_stream.seek(0)
        reader = csv.reader(self._text_stream, self._dialect)
        return reader.__iter__()

    def close(self):
        try:
            self._file.close()
        except Exception:
            pass


def trim_after_last_newline(text):

    index = text.rfind('\r\n')
    if index == -1:
        index = text.rfind('\n')
        if index == -1:
            index = text.rfind('\r')

    if index != -1:
        text = text[:index]

    return text
