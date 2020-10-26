#
# Copyright (C) 2016-2018 Jonathon Love
#

from libcpp cimport bool
from libcpp.string cimport string
from libcpp.vector cimport vector
from libcpp.list cimport list as cpplist
from libcpp.pair cimport pair

from cython.operator cimport dereference as deref, postincrement as inc

from jamovi.server.utils import is_int32

import math
import os
import os.path

from enum import Enum

cdef extern from "column.h":
    cdef cppclass CLevelData "LevelData":
        CLevelData()
        CLevelData(int value, const char *label);
        CLevelData(const char *value, const char *label);
        int ivalue() const;
        const char *svalue() const;
        const char *label() const;
    ctypedef union Value:
        char *s
        float d
        int i
    ctypedef enum CMeasureType  "MeasureType::Type":
        CMeasureTypeNone        "MeasureType::NONE"
        CMeasureTypeNominal     "MeasureType::NOMINAL"
        CMeasureTypeOrdinal     "MeasureType::ORDINAL"
        CMeasureTypeContinuous  "MeasureType::CONTINUOUS"
        CMeasureTypeID          "MeasureType::ID"
    ctypedef enum CDataType  "DataType::Type":
        CDataTypeNone     "DataType::NONE"
        CDataTypeInteger  "DataType::INTEGER"
        CDataTypeDecimal  "DataType::DECIMAL"
        CDataTypeText     "DataType::TEXT"
    ctypedef struct CMissingValue "MissingValue":
        int type
        int optr
        Value value

cdef extern from "datasetw.h":
    cdef cppclass CDataSet "DataSetW":
        @staticmethod
        CDataSet *create(CMemoryMap *mm) except +
        @staticmethod
        CDataSet *retrieve(CMemoryMap *mm) except +
        int rowCount() const
        int rowCountExFiltered() const
        int columnCount() const
        bool isRowFiltered(int index) const
        CColumn appendColumn(const char *name, const char *importName) except +
        CColumn insertColumn(int index, const char *name, const char *importName) except +
        void setRowCount(size_t count) except +
        void insertRows(int start, int end) except +
        void deleteRows(int start, int end) except +
        void deleteColumns(int start, int end) except +
        void refreshFilterState() except +
        int getIndexExFiltered(int index) except +
        CColumn operator[](int index) except +
        CColumn operator[](const char *name) except +
        CColumn getColumnById(int id) except +
        void setEdited(bool edited);
        bool isEdited() const;
        void setBlank(bool blank);
        bool isBlank() const;

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

        if isinstance(index_or_name, int):
            index = index_or_name
            c._this = deref(self._this)[index]
        elif isinstance(index_or_name, str):
            name = index_or_name.encode('utf-8')
            c._this = deref(self._this)[name.c_str()]
        else:
            raise ValueError

        return c

    def __iter__(self):
        return ColumnIterator(self)

    def append_column(self, name, import_name=''):
        c = Column()
        c._this = self._this.appendColumn(name.encode('utf-8'), import_name.encode('utf-8'))
        return c

    def insert_column(self, index, name, import_name=''):
        c = Column()
        c._this = self._this.insertColumn(index, name.encode('utf-8'), import_name.encode('utf-8'))
        return c

    def set_row_count(self, count):
        self._this.setRowCount(count)

    def insert_rows(self, row_start, row_end):
        self._this.insertRows(row_start, row_end)

    def delete_rows(self, row_start, row_end):
        self._this.deleteRows(row_start, row_end)

    def delete_columns(self, col_start, col_end):
        self._this.deleteColumns(col_start, col_end)

    def is_row_filtered(self, index):
        return self._this.isRowFiltered(index)

    @property
    def row_count(self):
        return self._this.rowCount()

    @property
    def row_count_ex_filtered(self):
        return self._this.rowCountExFiltered()

    @property
    def column_count(self):
        return self._this.columnCount()

    def get_index_ex_filtered(self, index):
        if index < self.row_count_ex_filtered:
            return self._this.getIndexExFiltered(index)
        else:
            return index - self.row_count_ex_filtered + self.row_count

    def get_indices_ex_filtered(self, row_start, row_count):
        offsets = map(self.get_index_ex_filtered, range(row_start, row_start + row_count))
        offsets = list(offsets)
        return offsets

    property is_edited:
        def __get__(self):
            return self._this.isEdited()

        def __set__(self, edited):
            self._this.setEdited(edited)

    property is_blank:
        def __get__(self):
            return self._this.isBlank()

        def __set__(self, blank):
            self._this.setBlank(blank)

    def refresh_filter_state(self):
        self._this.refreshFilterState()

cdef extern from "columnw.h":
    cdef cppclass CColumn "ColumnW":
        const char *name() const
        void setName(const char *name)
        const char *importName() const
        void setImportName(const char *name)
        const char *description() const
        void setDescription(const char *description)
        int id() const
        void setId(int id)
        void setColumnType(CColumnType columnType)
        CColumnType columnType() const
        void setDataType(CDataType dataType)
        CDataType dataType() const
        void setMeasureType(CMeasureType measureType)
        CMeasureType measureType() const
        void setAutoMeasure(bool auto)
        bool autoMeasure() const
        void append[T](const T &value)
        T raw[T](int index)
        const char *raws(int index);
        void setIValue(int index, int value, bool init)
        void setDValue(int index, double value, bool init)
        void setSValue(int index, const char *value, bool init)
        const char *getLabel(int value) const
        const char *getLabel(const char* value) const
        const char *getImportValue(int value) const
        int valueForLabel(const char *label) const
        void appendLevel(int value, const char *label, const char *importValue)
        void appendLevel(int value, const char *label)
        void insertLevel(int value, const char *label, const char *importValue)
        void insertLevel(int value, const char *label)
        int levelCount() const
        bool hasLevel(const char *label) const
        bool hasLevel(int value) const
        bool hasLevels() const
        void clearLevels()
        void updateLevelCounts()
        void trimUnusedLevels()
        const vector[CLevelData] levels()
        void setLevels(vector[CLevelData] levels)
        void setMissingValues(vector[CMissingValue] missingValues)
        const vector[CMissingValue] missingValues()
        void setDPs(int dps)
        int dps() const
        int rowCount() const;
        int rowCountExFiltered() const;
        int changes() const;
        const char *formula() const;
        void setFormula(const char *value);
        const char *formulaMessage() const;
        void setFormulaMessage(const char *value);
        void setActive(bool active);
        bool active() const;
        void setTrimLevels(bool trim);
        bool trimLevels() const;
        void changeDMType(CDataType dataType, CMeasureType measureType);
        bool shouldTreatAsMissing(int index);

    ctypedef enum CColumnType "ColumnType::Type":
        CColumnTypeNone       "ColumnType::NONE"
        CColumnTypeData       "ColumnType::DATA"
        CColumnTypeComputed   "ColumnType::COMPUTED"
        CColumnTypeRecoded    "ColumnType::RECODED"
        CColumnTypeFilter     "ColumnType::FILTER"
        CColumnTypeOutput     "ColumnType::OUTPUT"

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
            return self._this.id();

        def __set__(self, id):
            self._this.setId(id)

    property name:
        def __get__(self):
            return self._this.name().decode('utf-8')

        def __set__(self, name):
            if not isinstance(name, str):
                raise TypeError('name must be instance of str')
            name = name[:63]
            self._this.setName(name.encode('utf-8'))

    property import_name:
        def __get__(self):
            return self._this.importName().decode('utf-8')

        def __set__(self, name):
            if not isinstance(name, str):
                raise TypeError('name must be instance of str')
            name = name[:63]
            self._this.setImportName(name.encode('utf-8'))

    property description:
        def __get__(self):
            return self._this.description().decode('utf-8')

        def __set__(self, desc):
            if not isinstance(desc, str):
                raise TypeError('desc must be instance of str')
            desc = desc[:1024]
            self._this.setDescription(desc.encode('utf-8'))

    property column_type:
        def __get__(self):
            return ColumnType(self._this.columnType())

        def __set__(self, column_type):
            if not isinstance(column_type, ColumnType):
                raise TypeError('column_type must be an instance of ColumnType')
            if column_type is not self.column_type:
                self._this.setColumnType(column_type.value)


    property data_type:
        def __get__(self):
            return DataType(self._this.dataType())

    property measure_type:
        def __get__(self):
            return MeasureType(self._this.measureType())

        def __set__(self, measure_type):
            self._this.setMeasureType(measure_type.value)

    property auto_measure:
        def __get__(self):
            return self._this.autoMeasure()

        def __set__(self, auto):
            self._this.setAutoMeasure(auto)

    property formula:
        def __get__(self):
            fmla = self._this.formula()
            if fmla is NULL:
                return ''
            return fmla.decode('utf-8')

        def __set__(self, value):
            self._this.setFormula(value.encode('utf-8'))

    property formula_message:
        def __get__(self):
            fmla_msg = self._this.formulaMessage()
            if fmla_msg is NULL:
                return ''
            return fmla_msg.decode('utf-8')

        def __set__(self, value):
            self._this.setFormulaMessage(value.encode('utf-8'))

    property dps:
        def __get__(self):
            if self.data_type is not DataType.DECIMAL:
                return 0
            return self._this.dps()

        def __set__(self, dps):
            self._this.setDPs(dps)

    property trim_levels:
        def __get__(self):
            return self._this.trimLevels()

        def __set__(self, trim):
            self._this.setTrimLevels(trim)

    def determine_dps(self):
        if self.data_type == DataType.DECIMAL:
            ceiling_dps = 3
            max_dps = 0
            for value in self:
                max_dps = max(max_dps, Column.how_many_dps(value, ceiling_dps))
                if max_dps == ceiling_dps:
                    break
            self.dps = max_dps

    property active:
        def __get__(self):
            return self._this.active()

        def __set__(self, active):
            self._this.setActive(active)


    @staticmethod
    def how_many_dps(value, max_dp=3):
        if math.isfinite(value) is False:
            return 0
        if math.isclose(value, 0):
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
        if self.data_type is DataType.DECIMAL:
            self._this.append[double](value)
        else:
            self._this.append[int](value)

    def append_level(self, raw, label, importValue=None):
        if importValue is None:
            importValue = label
        self._this.appendLevel(raw, label.encode('utf-8'), importValue.encode('utf-8'))

    def insert_level(self, raw, label, importValue=None):
        if importValue is None:
            importValue = label
        self._this.insertLevel(raw, label.encode('utf-8'), importValue.encode('utf-8'))

    def get_label(self, value):
        cdef int v
        if value == -2147483648:
            return ''
        v = value
        return self._this.getLabel(v).decode('utf-8');

    def get_value_for_label(self, label):
        return self._this.valueForLabel(label.encode('utf-8'))

    def clear_levels(self):
        self._this.clearLevels()

    def trim_unused_levels(self):
        self._this.trimUnusedLevels()

    @property
    def has_levels(self):
        return self._this.hasLevels()

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
        arr = [ ]
        if self.has_levels:
            levels = self._this.levels()
            if self.data_type is DataType.TEXT:
                count = 0
                for level in levels:
                    arr.append((
                        count,
                        level.label().decode('utf-8'),
                        level.svalue().decode('utf-8')))
                    count += 1
            else:
                for level in levels:
                    arr.append((
                        level.ivalue(),
                        level.label().decode('utf-8'),
                        level.svalue().decode('utf-8')))
        return arr

    @property
    def missing_values(self):
        arr = [ ]
        missing_values = self._this.missingValues()
        for missing_value in missing_values:
            if missing_value.type is 0:
                arr.append( self.string_missing_value({ 'optr': missing_value.optr, 'value': missing_value.value.s.decode('utf-8'), 'type': missing_value.type }))
            elif missing_value.type is 1:
                arr.append( self.string_missing_value({ 'optr': missing_value.optr, 'value': missing_value.value.d, 'type': missing_value.type }))
            else:
                arr.append( self.string_missing_value({ 'optr': missing_value.optr, 'value': missing_value.value.i, 'type': missing_value.type }))
        return arr

    @property
    def row_count(self):
        return self._this.rowCount();

    @property
    def row_count_ex_filtered(self):
        return self._this.rowCountExFiltered();

    @property
    def changes(self):
        return self._this.changes();

    def clear_at(self, index):
        if self.data_type == DataType.DECIMAL:
            self._this.setDValue(index, float('nan'), False)
        elif self.data_type == DataType.TEXT and self.measure_type == MeasureType.ID:
            self._this.setSValue(index, '', False)
        else:
            self._this.setIValue(index, -2147483648, False)

    def clear(self):
        for index in range(self.row_count):
            self.clear_at(index)
        self.clear_levels()

    def __setitem__(self, index, value):
        import warnings
        warnings.simplefilter('always', DeprecationWarning)  # turn off filter
        warnings.warn('Column.__setitem__() is deprecated',
                      category=DeprecationWarning,
                      stacklevel=2)
        warnings.simplefilter('default', DeprecationWarning)  # reset filter

        if index >= self.row_count:
            raise IndexError()

        if self.data_type is DataType.DECIMAL:
            self._this.setDValue(index, value, False)
        else:
            self._this.setIValue(index, value, False)

    def set_value(self, index, value, initing=False):
        if index >= self.row_count:
            raise IndexError()

        if self.data_type is DataType.DECIMAL:
            self._this.setDValue(index, value, False)
        elif self.data_type is DataType.TEXT and isinstance(value, str):
            if self.measure_type is MeasureType.ID:
                self._this.setSValue(index, value.encode(), initing)
            else:
                if value == '':
                    level_i = -2147483648
                elif self.has_level(value):
                    level_i = self.get_value_for_label(value)
                else:
                    level_i = self.level_count
                    level_v = value.encode('utf-8')
                    self._this.appendLevel(level_i, level_v, ''.encode('utf-8'))
                self._this.setIValue(index, level_i, initing)
        else:
            self._this.setIValue(index, value, initing)

    def get_value(self, index):
        cdef int raw

        if index >= self.row_count:
            raise IndexError()

        if self.data_type == DataType.DECIMAL:
            return self._this.raw[double](index)
        elif self.data_type == DataType.TEXT:
            if self.measure_type == MeasureType.ID:
                return self._this.raws(index).decode()
            else:
                raw = self._this.raw[int](index)
                return self._this.getLabel(raw).decode()
        else:
            return self._this.raw[int](index)

    def __getitem__(self, index):
        return self.get_value(index)

    def __iter__(self):
        return CellIterator(self)

    def raw(self, index):
        if self.data_type == DataType.DECIMAL:
            return self._this.raw[double](index)
        else:
            return self._this.raw[int](index)

    def set_data_type(self, data_type):
        self._this.setDataType(data_type.value)

    def set_measure_type(self, measure_type):
        self._this.setMeasureType(measure_type.value)

    def set_levels(self, levels):
        cdef vector[CLevelData] new_levels
        cdef const char* label
        cdef const char* svalue
        cdef int ivalue
        cdef CLevelData new_level

        if self.data_type == DataType.TEXT:
            for level in levels:
                utf8_bytes = level[2].encode('utf-8')
                svalue = utf8_bytes
                utf8_bytes = level[1].encode('utf-8')
                label = utf8_bytes
                new_levels.push_back(CLevelData(svalue, label))
        else:
            for level in levels:
                ivalue = level[0]
                utf8_bytes = level[1].encode('utf-8')
                label = utf8_bytes
                new_levels.push_back(CLevelData(ivalue, label))

        self._this.setLevels(new_levels)

    def parse_missing_value(self, missing_value):
        optr = 0
        new_value = missing_value.strip()
        if new_value.startswith('=='):
            optr = 0
            new_value = new_value[2:].strip()
        elif new_value.startswith('!='):
            optr = 1
            new_value = new_value[2:].strip()
        elif new_value.startswith('<='):
            optr = 2
            new_value = new_value[2:].strip()
        elif new_value.startswith('>='):
            optr = 3
            new_value = new_value[2:].strip()
        elif new_value.startswith('<'):
            optr = 4
            new_value = new_value[1:].strip()
        elif new_value.startswith('>'):
            optr = 5
            new_value = new_value[1:].strip()

        type = 0
        if new_value.startswith('"') or new_value.startswith("'"):
            type = 0
            new_value = new_value[1:-1]
        else:
            type = 1
            new_value = float(new_value)
            if new_value.is_integer() and is_int32(new_value):
                type = 2
                new_value = int(new_value)

        return {'optr': optr, 'value': new_value, 'type': type }

    def string_missing_value(self, missing_value):
        new_value = ''
        if missing_value['optr'] is 0:
            new_value = '== '
        elif missing_value['optr'] is 1:
            new_value = '!= '
        elif missing_value['optr'] is 2:
            new_value = '<= '
        elif missing_value['optr'] is 3:
            new_value = '>= '
        elif missing_value['optr'] is 4:
            new_value = '< '
        elif missing_value['optr'] is 5:
            new_value = '> '

        if missing_value['type'] is 0:
            new_value = "{}'{}'".format(new_value, missing_value['value'])
        else:
            new_value = "{}{}".format(new_value, missing_value['value'])

        return new_value

    def set_missing_values(self, missing_values):
        cdef vector[CMissingValue] new_missing_values
        cdef int optr
        cdef const char* svalue
        cdef int ivalue
        cdef CMissingValue m_value

        for missing_value in missing_values:
            pmv = self.parse_missing_value(missing_value)
            if pmv['type'] is 0:
                utf8_bytes = pmv['value'].encode('utf-8')
                m_value.value.s = utf8_bytes
            elif pmv['type'] is 1:
                m_value.value.d = pmv['value']
            elif pmv['type'] is 2:
                m_value.value.i = pmv['value']

            m_value.type = pmv['type']
            m_value.optr = pmv['optr']
            new_missing_values.push_back(m_value)

        self._this.setMissingValues(new_missing_values)

    def change(self,
        data_type=None,
        measure_type=None,
        levels=None):

        if data_type is None:
            data_type = DataType.NONE
        elif not isinstance(data_type, DataType):
            raise TypeError('data_type must be an instance of DataType')

        if measure_type is None:
            measure_type = MeasureType.NONE
        elif not isinstance(measure_type, MeasureType):
            raise TypeError('measure_type must be an instance of MeasureType')

        if data_type == self.data_type:  # unchanged
            data_type = DataType.NONE

        if measure_type == self.measure_type:  # unchanged
            measure_type = MeasureType.NONE

        if ((data_type != self.data_type and data_type != DataType.NONE) or
            (measure_type != self.measure_type and measure_type != MeasureType.NONE)):
            self._this.changeDMType(data_type.value, measure_type.value)
            self.determine_dps()
        elif levels is not None:
            self.set_levels(levels)

    def should_treat_as_missing(self, index):
        return self._this.shouldTreatAsMissing(index);

cdef extern from "dirs.h":
    cdef cppclass CDirs "Dirs":
        @staticmethod
        string homeDir() except +
        @staticmethod
        string documentsDir() except +
        @staticmethod
        string downloadsDir() except +
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
        # return decode(CDirs.appDataDir())
        # CDirs.appDataDir() seems to have stopped working under macOS
        # hence, us handling it here.

        IF UNAME_SYSNAME == 'Darwin':
            path = os.path.expanduser('~/Library/Application Support/jamovi')
            os.makedirs(path, exist_ok=True)
            return path
        ELSE:
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
    def downloads_dir():
        return decode(CDirs.downloadsDir())
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
        void close() except +

cdef class MemoryMap:
    cdef CMemoryMap *_this

    @staticmethod
    def create(path, size=4*1024*1024):
        mm = MemoryMap()
        mm._this = CMemoryMap.create(path.encode('utf-8'), size=size)
        return mm

    def __init__(self):
        pass

    def close(self):
        self._this.close()


def decode(string str):
    return str.c_str().decode('utf-8')


class DataType(Enum):
    INTEGER = CDataTypeInteger
    DECIMAL = CDataTypeDecimal
    TEXT    = CDataTypeText
    NONE    = CDataTypeNone

    @staticmethod
    def stringify(data_type):
        if data_type == DataType.INTEGER:
            return 'Integer'
        elif data_type == DataType.DECIMAL:
            return 'Decimal'
        elif data_type == DataType.TEXT:
            return 'Text'
        else:
            return 'Integer'

    @staticmethod
    def parse(data_type):
        if data_type == 'Integer':
            return DataType.INTEGER
        elif data_type == 'Decimal':
            return DataType.DECIMAL
        elif data_type == 'Text':
            return DataType.TEXT
        else:
            return DataType.INTEGER


class MeasureType(Enum):
    NONE         = CMeasureTypeNone
    NOMINAL      = CMeasureTypeNominal
    ORDINAL      = CMeasureTypeOrdinal
    CONTINUOUS   = CMeasureTypeContinuous
    ID           = CMeasureTypeID

    @staticmethod
    def stringify(measure_type):
        if measure_type == MeasureType.CONTINUOUS:
            return 'Continuous'
        elif measure_type == MeasureType.ORDINAL:
            return 'Ordinal'
        elif measure_type == MeasureType.NOMINAL:
            return 'Nominal'
        elif measure_type == MeasureType.ID:
            return 'ID'
        else:
            return 'None'

    @staticmethod
    def parse(measure_type):
        if measure_type == 'Continuous':
            return MeasureType.CONTINUOUS
        elif measure_type == 'Ordinal':
            return MeasureType.ORDINAL
        elif measure_type == 'Nominal':
            return MeasureType.NOMINAL
        elif measure_type == 'ID':
            return MeasureType.ID
        elif measure_type == 'None':
            return MeasureType.NONE
        else:
            return MeasureType.CONTINUOUS

class ColumnType(Enum):
    NONE     = CColumnTypeNone
    DATA     = CColumnTypeData
    COMPUTED = CColumnTypeComputed
    RECODED  = CColumnTypeRecoded
    FILTER  = CColumnTypeFilter
    OUTPUT  = CColumnTypeOutput

    @staticmethod
    def stringify(value):
        if value == ColumnType.DATA:
            return 'Data'
        elif value == ColumnType.COMPUTED:
            return 'Computed'
        elif value == ColumnType.RECODED:
            return 'Recoded'
        elif value == ColumnType.FILTER:
            return 'Filter'
        elif value == ColumnType.OUTPUT:
            return 'Output'
        elif value == ColumnType.NONE:
            return 'None'
        else:
            return 'Data'

    @staticmethod
    def parse(value):
        if value == 'Data':
            return ColumnType.DATA
        elif value == 'Computed':
            return ColumnType.COMPUTED
        elif value == 'Recoded':
            return ColumnType.RECODED
        elif value == 'Filter':
            return ColumnType.FILTER
        elif value == 'Output':
            return ColumnType.OUTPUT
        elif value == 'None':
            return ColumnType.NONE
        else:
            return ColumnType.DATA

cdef extern from "platforminfo.h":
    cdef cppclass CPlatformInfo "PlatformInfo":
        @staticmethod
        cpplist[string] platform()

class PlatformInfo:
    @staticmethod
    def platform():
        platforms = CPlatformInfo.platform()
        ps = [ ]
        for plat in platforms:
            ps.append(decode(plat))
        return ps
