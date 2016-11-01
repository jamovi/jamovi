#
# Copyright (C) 2016 Jonathon Love
#

from libcpp cimport bool
from libcpp.string cimport string
from libcpp.vector cimport vector
from libcpp.pair cimport pair

from cython.operator cimport dereference as deref, postincrement as inc

import math
import platform
import os
import os.path

from enum import Enum

cdef extern from "datasetw.h":
    cdef cppclass CDataSet "DataSetW":
        @staticmethod
        CDataSet *create(CMemoryMap *mm) except +
        @staticmethod
        CDataSet *retrieve(CMemoryMap *mm) except +
        int rowCount() const
        int columnCount() const
        CColumn appendColumn(const char *name, const char *importName) except +
        void setRowCount(size_t count) except +
        void appendRow() except +
        CColumn operator[](int index) except +
        CColumn operator[](const char *name) except +
        CColumn getColumnById(int id) except +

class ColumnIterator:
    def __init__(self, dataset):
        self._i = 0
        self._dataset = dataset
    def __next__(self):
        if self._i >= self._dataset.column_count:
            raise StopIteration
        c = self._dataset[self._i]
        self._i += 1
        return c

cdef class DataSet:

    cdef CDataSet *_this

    @staticmethod
    def create(MemoryMap memoryMap):
        ds = DataSet()
        ds._this = CDataSet.create(memoryMap._this)
        return ds

    @staticmethod
    def retrieve(MemoryMap memoryMap):
        ds = DataSet()
        ds._this = CDataSet.retrieve(memoryMap._this)
        return ds

    def __getitem__(self, index_or_name):
        cdef int index
        cdef string name

        c = Column()

        if type(index_or_name) == int:
            index = index_or_name
            c._this = deref(self._this)[index]
        else:
            name = index_or_name.encode('utf-8')
            c._this = deref(self._this)[name.c_str()]

        return c

    def __iter__(self):
        return ColumnIterator(self)

    def get_column_by_id(self, id):
        cdef int _id

        c = Column()
        _id = id
        c._this = deref(self._this).getColumnById(_id)
        return c

    def append_column(self, name, import_name=None):
        c = Column()
        if import_name is None:
            import_name = name
        c._this = self._this.appendColumn(name.encode('utf-8'), import_name.encode('utf-8'))
        return c

    def set_row_count(self, count):
        self._this.setRowCount(count)

    def append_row(self):
        self._this.appendRow()

    @property
    def row_count(self):
        return self._this.rowCount()

    @property
    def column_count(self):
        return self._this.columnCount()

cdef extern from "columnw.h":
    cdef cppclass CColumn "ColumnW":
        const char *name() const
        void setName(const char *name)
        const char *importName() const
        int id() const
        void setMeasureType(CMeasureType measureType)
        CMeasureType measureType() const
        void setAutoMeasure(bool auto)
        bool autoMeasure() const
        void append[T](const T &value)
        void setValue[T](int index, T value)
        T value[T](int index)
        const char *getLabel(int value) const
        int valueForLabel(const char *label) const
        void appendLevel(int value, const char *label)
        void insertLevel(int value, const char *label)
        int levelCount() const
        bool hasLevel(const char *label) const
        bool hasLevel(int value) const
        void clearLevels()
        vector[pair[int, string]] levels()
        void setDPs(int dps)
        int dps() const
        int rowCount() const;
        int changes() const;

cdef extern from "column.h":
    ctypedef enum CMeasureType  "MeasureType::Type":
        CMeasureTypeMisc        "MeasureType::MISC"
        CMeasureTypeNominalText "MeasureType::NOMINAL_TEXT"
        CMeasureTypeNominal     "MeasureType::NOMINAL"
        CMeasureTypeOrdinal     "MeasureType::ORDINAL"
        CMeasureTypeContinuous  "MeasureType::CONTINUOUS"

class CellIterator:
    def __init__(self, column):
        self._i = 0
        self._column = column
    def __next__(self):
        if self._i >= self._column.row_count:
            raise StopIteration
        c = self._column[self._i]
        self._i += 1
        return c

cdef class Column:
    cdef CColumn _this

    property id:
        def __get__(self):
            return self._this.id()

    property name:
        def __get__(self):
            return self._this.name().decode('utf-8')

        def __set__(self, name):
            self._this.setName(name.encode('utf-8'))

    property import_name:
        def __get__(self):
            return self._this.importName().decode('utf-8')

    property measure_type:
        def __get__(self):
            return MeasureType(self._this.measureType())

        def __set__(self, measure_type):
            if type(measure_type) is MeasureType:
                measure_type = measure_type.value
            self._this.setMeasureType(measure_type)

    property auto_measure:
        def __get__(self):
            return self._this.autoMeasure()

        def __set__(self, auto):
            self._this.setAutoMeasure(auto)

    property dps:
        def __get__(self):
            return self._this.dps()

        def __set__(self, dps):
            self._this.setDPs(dps)

    def determine_dps(self):
        if self.measure_type == MeasureType.CONTINUOUS:
            ceiling_dps = 3
            max_dps = 0
            for value in self:
                max_dps = max(max_dps, Column.how_many_dps(value, ceiling_dps))
                if max_dps == ceiling_dps:
                    break
            self.dps = max_dps

    @staticmethod
    def how_many_dps(value, max_dp=3):
        if math.isfinite(value) is False:
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

    def append(self, value):
        if self.measure_type is MeasureType.CONTINUOUS:
            self._this.append[double](value)
        else:
            self._this.append[int](value)

    def append_level(self, raw, label):
        self._this.appendLevel(raw, label.encode('utf-8'))

    def insert_level(self, raw, label):
        self._this.insertLevel(raw, label.encode('utf-8'))

    def get_value_for_label(self, label):
        return self._this.valueForLabel(label.encode('utf-8'))

    def clear_levels(self):
        self._this.clearLevels()

    @property
    def has_levels(self):
        return self.measure_type != MeasureType.CONTINUOUS

    @property
    def level_count(self):
        return self._this.levelCount();

    def has_level(self, index_or_name):
        cdef int i;
        cdef string s;
        if type(index_or_name) is int:
            i = index_or_name
            return self._this.hasLevel(i);
        else:
            s = index_or_name.encode('utf-8')
            return self._this.hasLevel(s.c_str());

    @property
    def levels(self):
        if self.has_levels is False:
            return None
        arr = [ ]
        levels = self._this.levels()
        for level in levels:
            arr.append((level.first, level.second.decode('utf-8')))
        return arr

    @property
    def row_count(self):
        return self._this.rowCount();

    @property
    def changes(self):
        return self._this.changes();

    def clear_at(self, index):
        if self.measure_type is MeasureType.CONTINUOUS:
            self._this.setValue[double](index, float('nan'))
        else:
            self._this.setValue[int](index, -2147483648)

    def __setitem__(self, index, value):
        if self.measure_type is MeasureType.CONTINUOUS:
            self._this.setValue[double](index, value)
        else:
            self._this.setValue[int](index, value)

    def __getitem__(self, index):
        if self.measure_type == MeasureType.CONTINUOUS:
            return self._this.value[double](index)
        elif self.measure_type == MeasureType.NOMINAL_TEXT:
            raw = self._this.value[int](index)
            return self._this.getLabel(raw).decode()
        else:
            return self._this.value[int](index)

    def __iter__(self):
        return CellIterator(self)

    def raw(self, index):
        if self.measure_type == MeasureType.CONTINUOUS:
            return self._this.value[double](index)
        else:
            return self._this.value[int](index)

    def change(self, measure_type, name=None, levels=None, dps=None, auto_measure=None):

        if name is not None:
            self.name = name

        if type(measure_type) is not MeasureType:
            measure_type = MeasureType(measure_type)

        if dps is not None:
            self.dps = dps

        if auto_measure is not None:
            self.auto_measure = auto_measure

        new_type = measure_type
        old_type = self.measure_type

        if new_type == MeasureType.CONTINUOUS:
            values = list(self)
            nan = float('nan')
            for i in range(len(values)):
                try:
                    if values[i] != -2147483648:
                        values[i] = float(values[i])
                    else:
                        values[i] = nan
                except:
                    values[i] = nan

            self.clear_levels()
            self.measure_type = MeasureType.CONTINUOUS
            for i in range(len(values)):
                self[i] = values[i]

            if self.auto_measure:
                self.determine_dps()

        elif new_type == MeasureType.NOMINAL or new_type == MeasureType.ORDINAL:

            if old_type == MeasureType.NOMINAL or old_type == MeasureType.ORDINAL:
                self.measure_type = new_type

                if levels is not None:
                    old_levels = self.levels
                    recode = { }
                    for old_level in old_levels:
                        for new_level in levels:
                            if old_level[1] == new_level[1]:
                                recode[old_level[0]] = new_level[0]
                                break

                    self.clear_levels()
                    for level in levels:
                        self.append_level(level[0], level[1])

                    for row_no in range(self.row_count):
                        value = self._this.value[int](row_no)
                        value = recode.get(value, -2147483648)
                        self._this.setValue[int](row_no, value, True)

            elif old_type == MeasureType.NOMINAL_TEXT or old_type == MeasureType.CONTINUOUS:

                if old_type == MeasureType.NOMINAL_TEXT:
                    nan = ''
                else:
                    nan = float('nan')

                values = list(self)
                self.clear_levels()

                self.measure_type = new_type

                for i in range(len(values)):
                    try:
                        value = values[i]
                        if value != nan:
                            value = round(float(value))
                            if not self.has_level(value):
                                self.insert_level(value, str(value))
                        else:
                            value = -2147483648
                        self._this.setValue[int](i, value, True)
                    except ValueError:
                        self._this.setValue[int](i, -2147483648, True)

                self.dps = 0

        elif new_type == MeasureType.NOMINAL_TEXT:
            if old_type == MeasureType.NOMINAL_TEXT:
                if levels is not None:
                    old_levels = self.levels
                    recode = { }
                    for old_level in old_levels:
                        for new_level in levels:
                            if old_level[1] == new_level[1]:
                                recode[old_level[0]] = new_level[0]
                                break

                    self.clear_levels()
                    for level in levels:
                        self.append_level(level[0], level[1])

                    for row_no in range(self.row_count):
                        value = self._this.value[int](row_no)
                        value = recode.get(value, -2147483648)
                        self._this.setValue[int](row_no, value, True)

                self.measure_type = MeasureType.NOMINAL_TEXT

            elif old_type == MeasureType.CONTINUOUS:
                nan = float('nan')

                multip = math.pow(10, self.dps)

                uniques = set()
                for value in self:
                    if math.isnan(value) == False:
                        uniques.add(int(value * multip))
                uniques = list(uniques)
                uniques.sort()

                self.measure_type = MeasureType.NOMINAL_TEXT

                self.clear_levels()
                for i in range(len(uniques)):
                    v = float(uniques[i]) / multip
                    label = '{:.{}f}'.format(v, self.dps)
                    self.append_level(i, label)

                v2i = { }
                for i in range(len(uniques)):
                    v2i[uniques[i]] = i
                for i in range(self.row_count):
                    value = self._this.value[double](i)
                    if math.isnan(value):
                        self._this.setValue[int](i, -2147483648, True)
                    else:
                        self._this.setValue[int](i, v2i[int(value * multip)], True)

                self.determine_dps()

            else: # ordinal or nominal
                nan = -2147483648

                uniques = set()
                for value in self:
                    if value != -2147483648:
                        uniques.add(value)
                uniques = list(uniques)
                uniques.sort()

                self.measure_type = MeasureType.NOMINAL_TEXT

                self.clear_levels()
                for i in range(len(uniques)):
                    self.append_level(i, str(uniques[i]))

                v2i = { }
                for i in range(len(uniques)):
                    v2i[uniques[i]] = i
                for i in range(self.row_count):
                    value = self._this.value[int](i)
                    if value != nan:
                        self._this.setValue[int](i, v2i[value], True)

cdef extern from "dirs.h":
    cdef cppclass CDirs "Dirs":
        @staticmethod
        string homeDir() except +
        @staticmethod
        string documentsDir() except +
        @staticmethod
        string appDataDir() except +
        @staticmethod
        string tempDir() except +
        @staticmethod
        string exeDir() except +
        @staticmethod
        string rHomeDir() except +
        @staticmethod
        string libraryDir() except +
        @staticmethod
        string desktopDir() except +

cdef class Dirs:
    @staticmethod
    def app_data_dir():

        # CDirs.appDataDir() seems to have stopped working under macOS sierra,
        # hence, us handling it here.

        if platform.uname().system == 'Darwin':
            path = os.path.expanduser('~/Library/Application Support/jamovi')
            os.makedirs(path, exist_ok=True)
            return path
        else:
            return decode(CDirs.appDataDir())

    @staticmethod
    def temp_dir():
        return decode(CDirs.tempDir())
    @staticmethod
    def exe_dir():
        return decode(CDirs.exeDir())
    @staticmethod
    def documents_dir():
        return decode(CDirs.documentsDir())
    @staticmethod
    def home_dir():
        return decode(CDirs.homeDir())
    @staticmethod
    def desktop_dir():
        return decode(CDirs.desktopDir())

cdef extern from "memorymapw.h":
    cdef cppclass CMemoryMap "MemoryMapW":
        @staticmethod
        CMemoryMap *create(string path, unsigned long long size) except +

cdef class MemoryMap:
    cdef CMemoryMap *_this

    @staticmethod
    def create(path, size=32768):
        mm = MemoryMap()
        mm._this = CMemoryMap.create(path.encode('utf-8'), size=size)
        return mm

    def __init__(self):
        pass


def decode(string str):
    return str.c_str().decode('utf-8')

class MeasureType(Enum):
    MISC         = CMeasureTypeMisc
    NOMINAL_TEXT = CMeasureTypeNominalText
    NOMINAL      = CMeasureTypeNominal
    ORDINAL      = CMeasureTypeOrdinal
    CONTINUOUS   = CMeasureTypeContinuous

    @staticmethod
    def stringify(measure_type):
        if measure_type == MeasureType.CONTINUOUS:
            return "Continuous"
        elif measure_type == MeasureType.ORDINAL:
            return "Ordinal"
        elif measure_type == MeasureType.NOMINAL:
            return "Nominal"
        elif measure_type == MeasureType.NOMINAL_TEXT:
            return "NominalText"
        else:
            return "Misc"

    @staticmethod
    def parse(measure_type):
        if measure_type == "Continuous":
            return MeasureType.CONTINUOUS
        elif measure_type == "Ordinal":
            return MeasureType.ORDINAL
        elif measure_type == "Nominal":
            return MeasureType.NOMINAL
        elif measure_type == "NominalText":
            return MeasureType.NOMINAL_TEXT
        else:
            return MeasureType.MISC
