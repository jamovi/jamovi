//
// Copyright (C) 2016 Jonathon Love
//

#ifndef MEMORYMAP_H
#define MEMORYMAP_H

#include <string>
#include <boost/interprocess/file_mapping.hpp>
#include <boost/interprocess/mapped_region.hpp>

#define MM_VERSION_MAJOR 2
#define MM_VERSION_MINOR 0
#define MM_START_OFFSET 8

class MemoryMap {

public:
    static MemoryMap *attach(const std::string &path);

    template<class T> inline T *resolve(T *p)
    {
        return (T*)(_start - (char*)0 + (char*)p);
    }

    template<class T> inline T *base(T *p)
    {
        return (T*)((char*)p - _start);
    }

    template<class T> T *root() const
    {
        return (T*)MM_START_OFFSET;
    }

    unsigned short version() const
    {
        return *(unsigned short *)(_start + 6);
    }

protected:
    MemoryMap(const std::string &path, boost::interprocess::file_mapping *file, boost::interprocess::mapped_region *region);

    MemoryMap(const MemoryMap &); // prevent assignment
    void operator=(const MemoryMap &);
    void check() const;

    std::string _path;
    unsigned long long _size;
    boost::interprocess::file_mapping *_file;
    boost::interprocess::mapped_region *_region;

    char *_start;

};

#endif // MEMORYMAP_H
