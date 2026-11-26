"""Importer for Apache Parquet files, using pyarrow

Parquet files declare a type for each column, so (as in the readstat and
rdata importers) the data type comes from the file. Parquet has no notion
of measure type though, so that is decided as in the other importers:
integer and text columns with fewer than 50 unique values are nominal.
"""

import json
from datetime import UTC
from datetime import date
from datetime import timedelta

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType

from .exceptions import FileCorruptError

try:
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq
except ImportError:  # .parquet files can't be read without pyarrow
    pa = None


INT_MIN = -2147483648  # also the missing value for integer and nominal text
INT_MAX = 2147483647
MAX_LEVELS = 49  # 50 or more unique values isn't nominal (see reader.py)
BATCH_SIZE = 65536
EPOCH = date(1970, 1, 1)
SUBSECONDS = { 's': 1, 'ms': 1e3, 'us': 1e6, 'ns': 1e9 }


def get_readers():
    """.parquet is only registered if pyarrow is available"""
    if pa is None:
        return [ ]
    return [ ( 'parquet', read ) ]


def read(data, path, prog_cb, **_):
    """Read a .parquet file into a data set. The file is read twice, in
    batches: first to examine the values, and then (once the column types
    are decided) to fill them in"""

    try:
        file = pq.ParquetFile(path)
    except pa.ArrowInvalid as e:
        raise FileCorruptError() from e

    with file:
        row_count = file.metadata.num_rows
        total = max(row_count, 1)
        fields = list(file.schema_arrow)

        def batches():
            if len(fields) > 0:
                yield from file.iter_batches(batch_size=BATCH_SIZE)

        if len(fields) == 0:
            fields = [ pa.field('A', pa.null()) ]

        importers = [ ]
        for field in fields:
            column = data.append_column(field.name)
            column.column_type = ColumnType.DATA
            importers.append(ColumnImporter(column, field.type))

        row_no = 0
        for batch in batches():
            for importer, array in zip(importers, batch.columns):
                importer.examine(array)
            row_no += batch.num_rows
            prog_cb(0.33333 * row_no / total)

        for importer in importers:
            importer.ruminate()

        data.set_row_count(row_count)

        row_no = 0
        for batch in batches():
            for importer, array in zip(importers, batch.columns):
                importer.parse(array, row_no)
            row_no += batch.num_rows
            prog_cb(0.33333 + 0.66666 * row_no / total)

    for importer in importers:
        importer.column.determine_dps()


class ColumnImporter:
    """Decides the data and measure type of one column, and fills it in"""

    def __init__(self, column, arrow_type):
        self.column = column

        if isinstance(arrow_type, pa.ExtensionType):
            arrow_type = arrow_type.storage_type

        types = pa.types
        if types.is_null(arrow_type):
            self._kind = 'null'
        elif types.is_boolean(arrow_type):
            self._kind = 'bool'
        elif types.is_integer(arrow_type):
            self._kind = 'int'
        elif types.is_floating(arrow_type) or types.is_decimal(arrow_type):
            self._kind = 'decimal'
        elif types.is_duration(arrow_type):
            self._kind = 'duration'
        elif types.is_date(arrow_type):
            self._kind = 'date'
        elif types.is_timestamp(arrow_type):
            self._kind = 'timestamp'
        elif types.is_dictionary(arrow_type):
            self._kind = 'category'
        else:
            self._kind = 'text'

        self._type = arrow_type
        self._uniques = set()  # for 'int' and 'text'
        self._many_uniques = False
        self._in_range = True  # whether integers fit in 32 bits
        self._days = set()  # for 'date'
        # timestamps without a time zone, all at midnight, are dates
        self._at_midnight = self._kind == 'timestamp' and arrow_type.tz is None
        self._levels = { }  # for 'category': label -> level index

    def examine(self, array):
        """first pass: collect what is needed to decide the column type"""

        if isinstance(array, pa.ExtensionArray):
            array = array.storage

        kind = self._kind
        if kind == 'int':
            low, high = pc.min_max(array).as_py().values()
            if low is not None and (low < INT_MIN or high > INT_MAX):
                self._in_range = False
            self._add_uniques(array)
        elif kind == 'date':
            self._add_days(array)
        elif kind == 'timestamp':
            if self._at_midnight:
                midnight = pc.floor_temporal(array, unit='day')
                if pc.all(pc.equal(array, midnight), min_count=0).as_py():
                    self._add_days(array)
                else:
                    self._at_midnight = False
                    self._days = set()
            if not self._many_uniques:
                self._add_uniques(_to_text(array))
        elif kind == 'category':
            for label in _to_text(array.dictionary).to_pylist():
                if label is not None and label not in self._levels:
                    self._levels[label] = len(self._levels)
        elif kind == 'text' and not self._many_uniques:
            self._add_uniques(_to_text(array))

    def _add_uniques(self, array):
        if self._many_uniques:
            return
        self._uniques.update(array.unique().to_pylist())
        self._uniques.discard(None)
        if len(self._uniques) > MAX_LEVELS:
            self._many_uniques = True
            self._uniques = set()

    def _add_days(self, array):
        self._days.update(_to_days(array).unique().to_pylist())
        self._days.discard(None)

    def ruminate(self):
        """decide the column type, and add the levels"""

        column = self.column

        if self._kind == 'timestamp':
            self._kind = 'date' if self._at_midnight else 'text'
        elif self._kind == 'int' and not self._in_range:
            self._kind = 'decimal'

        kind = self._kind
        if kind in ('null', 'bool'):
            column.change(
                data_type=DataType.INTEGER,
                measure_type=MeasureType.NOMINAL)
            if kind == 'bool':
                # as in rdata.py
                column.append_level(0, 'FALSE')
                column.append_level(1, 'TRUE')
        elif kind == 'int':
            if self._many_uniques:
                column.change(
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.CONTINUOUS)
            else:
                column.change(
                    data_type=DataType.INTEGER,
                    measure_type=MeasureType.NOMINAL)
                for value in sorted(self._uniques):
                    column.append_level(value, str(value))
        elif kind in ('decimal', 'duration'):
            column.change(
                data_type=DataType.DECIMAL,
                measure_type=MeasureType.CONTINUOUS)
        elif kind == 'date':
            # as in readstat.py, dates are stored as days since 1970-01-01
            column.change(
                data_type=DataType.INTEGER,
                measure_type=MeasureType.ORDINAL)
            for days in sorted(self._days):
                column.append_level(days, _date_label(days), str(days))
        elif kind == 'category':
            # i.e. a pandas category or an R factor. the categories become
            # the levels, in the order of the file, and (as with value labels
            # in readstat.py) they are pinned. pyarrow only reads text
            # columns as categories, integer ones are read as integers
            if self._type.ordered:
                measure_type = MeasureType.ORDINAL
            else:
                measure_type = MeasureType.NOMINAL
            column.change(data_type=DataType.TEXT, measure_type=measure_type)
            for label, index in self._levels.items():
                column.append_level(index, label, pinned=True)
        elif self._many_uniques:
            column.change(
                data_type=DataType.TEXT,
                measure_type=MeasureType.ID)
        else:
            column.change(
                data_type=DataType.TEXT,
                measure_type=MeasureType.NOMINAL)
            self._uniques = sorted(self._uniques)
            for index, label in enumerate(self._uniques):
                column.append_level(index, label)

    def parse(self, array, row_no):
        """second pass: fill in the values"""

        if isinstance(array, pa.ExtensionArray):
            array = array.storage

        kind = self._kind
        if kind == 'decimal':
            # (integers too wide for 32 bits end up here, so safe=False
            # allows those too wide for a float to be rounded)
            values = array.cast(pa.float64(), safe=False)
            values = pc.fill_null(values, float('nan'))
        elif kind == 'duration':
            # durations become seconds
            per_second = SUBSECONDS[array.type.unit]
            values = array.cast(pa.int64()).cast(pa.float64(), safe=False)
            values = pc.divide(values, per_second)
            values = pc.fill_null(values, float('nan'))
        elif kind == 'text' and self._many_uniques:
            values = pc.fill_null(_to_text(array), '')
        else:
            if kind == 'null':
                values = pa.nulls(len(array), pa.int32())
            elif kind in ('bool', 'int'):
                values = array.cast(pa.int64())
            elif kind == 'date':
                values = _to_days(array)
            elif kind == 'category':
                # map this batch's dictionary onto the levels
                labels = _to_text(array.dictionary).to_pylist()
                indices = [ self._levels.get(label) for label in labels ]
                values = pc.take(pa.array(indices, pa.int32()), array.indices)
            else:
                levels = pa.array(self._uniques, pa.string())
                values = pc.index_in(_to_text(array), value_set=levels)
            values = pc.fill_null(values, INT_MIN)

        self.column.set_values(row_no, values.to_pylist())


def _to_days(array):
    """dates and timestamps -> days since 1970-01-01"""
    return array.cast(pa.date32()).cast(pa.int32())


def _date_label(days):
    try:
        return (EPOCH + timedelta(days=days)).isoformat()
    except OverflowError:
        return str(days)


def _to_text(array):
    """convert an array of any type to a string array. leading and trailing
    whitespace is removed, and empty strings become missing values"""

    arrow_type = array.type
    types = pa.types

    if (types.is_string(arrow_type)
            or types.is_large_string(arrow_type)
            or types.is_string_view(arrow_type)):
        strings = array.cast(pa.string())
    elif types.is_fixed_size_binary(arrow_type):
        # i.e. uuids
        strings = _from_python(array, lambda v: v.hex())
    elif (types.is_binary(arrow_type)
            or types.is_large_binary(arrow_type)
            or types.is_binary_view(arrow_type)):
        # strings written without a utf-8 annotation are read as binary
        try:
            strings = array.cast(pa.string())
        except pa.ArrowInvalid:
            strings = _from_python(array, lambda v: v.decode('utf-8', 'replace'))
    elif types.is_timestamp(arrow_type):
        strings = _timestamps_to_text(array)
    elif types.is_time(arrow_type):
        # python's time has microsecond resolution
        strings = _from_python(array.cast(pa.time64('us'), safe=False), str)
    elif types.is_nested(arrow_type):
        # as in jsonlines.py, lists and objects become json
        strings = _from_python(
            array,
            lambda v: json.dumps(v, default=str, ensure_ascii=False))
    else:
        strings = _from_python(array, str)

    strings = pc.utf8_trim_whitespace(strings)
    return pc.if_else(pc.equal(strings, ''), None, strings)


def _timestamps_to_text(array):
    """timestamps -> strings, as xlsx.py writes date-times, i.e. str() of a
    python datetime: 2024-01-31 13:45:00 (+01:00 if there's a time zone)"""

    # python's datetime has microsecond resolution
    tz = array.type.tz
    try:
        return _from_python(array.cast(pa.timestamp('us', tz=tz), safe=False), str)
    except (pa.ArrowException, ValueError, KeyError):
        # the time zone isn't available on this system, so use UTC
        array = array.cast(pa.timestamp('us'), safe=False)
        return _from_python(array, lambda v: str(v.replace(tzinfo=UTC)))


def _from_python(array, to_str):
    values = [ None if v is None else to_str(v) for v in array.to_pylist() ]
    return pa.array(values, pa.string())
