//
// Copyright (C) 2016 Jonathon Love
//

#ifndef MEMORYMAPW_H
#define MEMORYMAPW_H

#include "memorymap.h"

class MemoryMapW : public MemoryMap {

public:
    static MemoryMapW *create(const std::string &path, unsigned long long size);
    
    void enlarge(int percent = 50);
    void flush();
    void close();
    
    template<class T> T *allocateSize(size_t size, size_t *allocated = 0)
    {   
        size_t padding = 8 - (size % 8);   // align at 8 bytes
        if (padding > 0 && padding < 8)
            size += padding;
        
        if (allocated != NULL)
            *allocated = size;
        
        //std::cout << "allocating " << size << " bytes at " << (unsigned long long)(_cursor - _start) << "\n";
        //std::cout.flush();
        
        while (_cursor + size >= _end)
            enlarge();

        void *pos = _cursor;
        _cursor += size;
        return (T*)pos;
    }
    
    template<class T> T *allocate(int count = 1, size_t *allocated = 0)
    {
        return allocateSize<T>(count * sizeof(T), allocated);
    }
    
    template<class T> T *allocateBase(int count = 1, size_t *allocated = 0)
    {
        return base<T>(allocate<T>(count, allocated));
    }
    
    template<class T> T *allocateSizeBase(size_t size, size_t *allocated = 0)
    {
        return base<T>(allocateSize<T>(size, allocated));
    }
    
private:
    MemoryMapW(const std::string &path, boost::interprocess::file_mapping *file, boost::interprocess::mapped_region *region);

    char *_cursor;
    char *_end;
};

#endif // MEMORYMAPW_H