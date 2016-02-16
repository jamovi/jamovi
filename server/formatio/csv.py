
import csv
from silky import ColumnType
from ordered_set import OrderedSet


def read(dataset, path):

    with open(path) as csvfile:
        dialect = csv.Sniffer().sniff(csvfile.read(4096))
        csvfile.seek(0)
        reader = csv.reader(csvfile, dialect)

        itr = reader.__iter__()
        column_names = itr.__next__()

        column_count = 0
        column_writers = [ ]

        for i in range(len(column_names)):
            column_name = column_names[i]
            dataset.append_column(column_name)
            column = dataset[i]
            column_writers.append(ColumnWriter(column, i))
            column_count += 1

        rowCount = 0

        csvfile.seek(0)
        reader = csv.reader(csvfile, dialect)
        first = True

        for row in reader:
            if first:
                first = False
            else:
                dataset.appendRow()

                for i in range(column_count):
                    column_writers[i].examine_row(row)

                rowCount += 1

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

    return dataset


class ColumnWriter:
    def __init__(self, column, column_index):
        self._column = column
        self._column_index = column_index

        self._only_integers = True
        self._only_floats = True
        self._is_empty = True
        self._unique_values = OrderedSet()
        self._many_uniques = False
        self._column_type = None
        self._examination_complete = False

    def examine_row(self, row):

        if self._examination_complete:
            return

        if self._column_index >= len(row):
            return

        value = row[self._column_index]

        if value == "" or value == " ":
            return
        else:
            self._is_empty = False

        if self._many_uniques is False:
            if len(self._unique_values) >= 49:
                self._many_uniques = True
                self._unique_values.clear()
            else:
                self._unique_values.add(value)

        if self._only_integers:
            try:
                int(value)
            except ValueError:
                self._only_integers = False

        if self._only_floats:
            try:
                float(value)
            except ValueError:
                self._only_floats = False

        if self._many_uniques and self._only_floats is False and self._only_integers is False:
            self._column_type = ColumnType.MISC
            self._unique_values = None
            self._examination_complete = True

    def _ruminate(self):

        if self._column_type is None:
            if self._only_integers and self._many_uniques is False:
                self._column_type = ColumnType.NOMINAL
            elif self._only_floats:
                self._column_type = ColumnType.CONTINUOUS
            elif self._many_uniques:
                self._column_type = ColumnType.MISC
            else:
                self._column_type = ColumnType.NOMINAL_TEXT

                for i in range(len(self._unique_values)):
                    label = self._unique_values[i]
                    self._column.addLabel(i, label)

        self._examination_complete = True
        self._column.set_column_type(self._column_type)

    def parse_row(self, row, row_no):

        if self._examination_complete is False:
            self._ruminate()

        if self._column_index >= len(row):
            value = None
        else:
            value = row[self._column_index]

            if value == '' or value == ' ':
                value = None

        if self._column_type == ColumnType.NOMINAL or self._column_type == ColumnType.ORDINAL:
            if value is None:
                self._column[row_no] = -2147483648
            else:
                self._column[row_no] = int(value)

        elif self._column_type == ColumnType.CONTINUOUS:
            if value is None:
                self._column[row_no] = float('nan')
            else:
                self._column[row_no] = float(value)

        elif self._column_type == ColumnType.NOMINAL_TEXT:

            if value is None:
                self._column[row_no] = -2147483648
            else:
                self._column[row_no] = self._unique_values.index(value)

        else:
            self._column[row_no] = -2147483648
