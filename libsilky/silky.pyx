

from libcpp cimport bool
from libcpp.string cimport string

from cython.operator cimport dereference as deref, postincrement as inc

import json
import os
import subprocess

cdef extern from "silky/dataset2.h":
    cdef cppclass CDataSet "DataSet2":
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
        if self._i >= self._dataset.columnCount():
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
    
    def appendRow(self):
        self._this.appendRow()
        
    def rowCount(self):
        return self._this.rowCount()
        
    def columnCount(self):
        return self._this.columnCount()
        
cdef extern from "silky/column2.h":
    cdef cppclass CColumn "Column2":
        string name() const
        void setColumnType(CColumnType columnType)
        CColumnType columnType() const
        const char *c_str() const
        void append[T](const T &value)
        int &intCell(int index)
        double &doubleCell(int index)
        const char *getLabel(int value)
        void addLabel(int value, const char *label);
        
cdef extern from "silky/column2.h":
    ctypedef enum CColumnType  "Column2::ColumnType":
        CColumnTypeMisc        "Column2::Misc"
        CColumnTypeNominalText "Column2::NominalText"
        CColumnTypeNominal     "Column2::Nominal"
        CColumnTypeOrdinal     "Column2::Ordinal"
        CColumnTypeContinuous  "Column2::Continuous"

cdef class Column:
    cdef CColumn _this
    
    def name(self):
        return self._this.c_str().decode('utf-8')
    
    @property
    def column_type(self):
        return self._this.columnType()
    
    def set_column_type(self, columnType):
        self._this.setColumnType(columnType)
    
    def append(self, value):
        if type(value) is int:
            self._this.append[int](value)
        elif type(value) is float:
            self._this.append[double](value)
        else:
            raise ValueError('must be either int or float')
    
    def addLabel(self, raw, label):
        self._this.addLabel(raw, label.encode('utf-8'))
    
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
        if self._this.columnType() == ColumnType.CONTINUOUS:
            return self._this.doubleCell(index)
        elif self._this.columnType() == ColumnType.NOMINAL_TEXT:
            raw = self._this.intCell(index)
            return self._this.getLabel(raw).decode()
        else:
            return self._this.intCell(index)

cdef extern from "silky/dirs2.h":
    cdef cppclass CDirs "Dirs2":
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
    def appDataDir():
        return decode(CDirs.appDataDir())
    @staticmethod
    def tempDir():
        return decode(CDirs.tempDir())
    @staticmethod
    def exeDir():
        return decode(CDirs.exeDir())
    @staticmethod
    def documentsDir():
        return decode(CDirs.documentsDir())
    @staticmethod
    def homeDir():
        return decode(CDirs.homeDir())
    @staticmethod
    def desktopDir():
        return decode(CDirs.desktopDir())

cdef extern from "silky/memorymap.h":
    cdef cppclass CMemoryMap "MemoryMap":
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

cdef extern from "silky/tempfiles.h":
    void tempfiles_init(long pid)
    void tempfiles_attach(long pid)
    string tempfiles_createSpecific(const string &dir, const string &filename)
    void tempfiles_deleteOrphans()
    void tempfiles_deleteAll()

cdef class TempFiles:
    @staticmethod
    def init(pid):
        tempfiles_init(pid)
    @staticmethod
    def attach(pid):
        tempfiles_init(pid)
    @staticmethod
    def create_specific(dir, name):
        return decode(tempfiles_createSpecific(dir.encode('utf-8'), name.encode('utf-8')))
    @staticmethod
    def delete_orphans():
        tempfiles_deleteOrphans()
    @staticmethod
    def delete_all():
        tempfiles_deleteAll()


def decode(string str):
    return str.c_str().decode('utf-8')

class ColumnType:
    MISC         = CColumnTypeMisc
    NOMINAL_TEXT = CColumnTypeNominalText
    NOMINAL      = CColumnTypeNominal
    ORDINAL      = CColumnTypeOrdinal
    CONTINUOUS   = CColumnTypeContinuous
    
    @staticmethod
    def stringify(columnType):
        if columnType == ColumnType.CONTINUOUS:
            return "Continuous"
        elif columnType == ColumnType.ORDINAL:
            return "Ordinal"
        elif columnType == ColumnType.NOMINAL:
            return "Nominal"
        elif columnType == ColumnType.NOMINAL_TEXT:
            return "NominalText"
        else:
            return "Misc"
            
    @staticmethod
    def parse(columnType):
        if columnType == "Continuous":
            return ColumnType.CONTINUOUS
        elif columnType == "Ordinal":
            return ColumnType.ORDINAL
        elif columnType == "Nominal":
            return ColumnType.NOMINAL
        elif columnType == "NominalText":
            return ColumnType.NOMINAL_TEXT
        else:
            return ColumnType.MISC
