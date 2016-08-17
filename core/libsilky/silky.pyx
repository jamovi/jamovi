#
# Copyright (C) 2016 Jonathon Love
#

from libcpp cimport bool
from libcpp.string cimport string
from libcpp.map cimport map
from libcpp.pair cimport pair

from cython.operator cimport dereference as deref, postincrement as inc

import json
import os
import subprocess

cdef extern from "datasetw.h":
    cdef cppclass CDataSet "DataSetW":
        @staticmethod
        CDataSet *create(CMemoryMap *mm) except +
        @staticmethod
        CDataSet *retrieve(CMemoryMap *mm) except +
        int rowCount()
        int columnCount()
        void appendColumn(string name) except +
        void appendRow() except +
        CColumn operator[](int index) except +

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

    def __getitem__(self, index):
        c = Column()
        c._this = deref(self._this)[index]
        return c

    def __iter__(self):
        return ColumnIterator(self)

    def append_column(self, name):
        self._this.appendColumn(name.encode('utf-8'))

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
        string name() const
        void setColumnType(CColumnType columnType)
        CColumnType columnType() const
        const char *c_str() const
        void append[T](const T &value)
        int &intCell(int index)
        double &doubleCell(int index)
        const char *getLabel(int value)
        void addLabel(int value, const char *label)
        int labelCount()
        map[int, string] labels()
        void setDPs(int dps)
        int dps() const

cdef extern from "column.h":
    ctypedef enum CColumnType  "Column::ColumnType":
        CColumnTypeMisc        "Column::Misc"
        CColumnTypeNominalText "Column::NominalText"
        CColumnTypeNominal     "Column::Nominal"
        CColumnTypeOrdinal     "Column::Ordinal"
        CColumnTypeContinuous  "Column::Continuous"

cdef class Column:
    cdef CColumn _this

    @property
    def name(self):
        return self._this.c_str().decode('utf-8')

    property type:
        def __get__(self):
            return self._this.columnType()

        def __set__(self, type):
            self._this.setColumnType(type)

    property dps:
        def __get__(self):
            return self._this.dps()

        def __set__(self, dps):
            self._this.setDPs(dps)

    def append(self, value):
        if type(value) is int:
            self._this.append[int](value)
        elif type(value) is float:
            self._this.append[double](value)
        else:
            raise ValueError('must be either int or float')

    def add_label(self, raw, label):
        self._this.addLabel(raw, label.encode('utf-8'))

    @property
    def has_labels(self):
        return self._this.labelCount() > 0

    @property
    def labels(self):
        if self.has_labels is False:
            return None
        arr = [ ]
        labels = self._this.labels()
        for label in labels:
            arr.append([label.first, label.second.decode('utf-8')])
        return arr

    def __setitem__(self, index, value):
        cdef int *v
        cdef double *d

        if type(value) is int:
            v = &self._this.intCell(index)
            v[0] = value
        elif type(value) is float:
            d = &self._this.doubleCell(index)
            d[0] = value
        else:
            raise ValueError('must be either int or float')

    def __getitem__(self, index):
        if self._this.columnType() == MeasureType.CONTINUOUS:
            return self._this.doubleCell(index)
        elif self._this.columnType() == MeasureType.NOMINAL_TEXT:
            raw = self._this.intCell(index)
            return self._this.getLabel(raw).decode()
        else:
            return self._this.intCell(index)

    def raw(self, index):
        if self._this.columnType() == MeasureType.CONTINUOUS:
            return self._this.doubleCell(index)
        else:
            return self._this.intCell(index)

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

class MeasureType:
    MISC         = CColumnTypeMisc
    NOMINAL_TEXT = CColumnTypeNominalText
    NOMINAL      = CColumnTypeNominal
    ORDINAL      = CColumnTypeOrdinal
    CONTINUOUS   = CColumnTypeContinuous

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
