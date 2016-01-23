//
// Copyright (C) 2016 Jonathon Love
//


#ifndef MEMORYMAP_H
#define MEMORYMAP_H

#include <string>
#include <boost/interprocess/file_mapping.hpp>
#include <boost/interprocess/mapped_region.hpp>

class MemoryMap {

public:
    static MemoryMap *create(const std::string &path, unsigned long long size);
    static MemoryMap *attach(const std::string &path, unsigned long long size);
    
    void enlarge(int percent = 50);
    void flush();
    
    template<class T> inline T *resolve(T *p)
    {
        return (T*)(_start - (char*)0 + (char*)p);
    }
    
    template<class T> inline T *base(T *p)
    {
        return (T*)((char*)p - _start);
    }
    
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
    
    template<class T> T *root() const
    {
        return (T*)_region->get_address();
    }
    
private:
    MemoryMap(const std::string &path, boost::interprocess::file_mapping *file, boost::interprocess::mapped_region *region);
    
    MemoryMap(const MemoryMap &); // prevent assignment
    void operator=(const MemoryMap &);
    
    std::string _path;
    unsigned long long _size;
    boost::interprocess::file_mapping *_file;
    boost::interprocess::mapped_region *_region;

    char *_start;
    char *_cursor;
    char *_end;

};

#endif // MEMORYMAP_H