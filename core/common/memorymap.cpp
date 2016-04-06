//
// Copyright (C) 2016 Jonathon Love
//

#include "memorymap.h"

#include <boost/nowide/fstream.hpp>

using namespace std;
using namespace boost;

MemoryMap *MemoryMap::attach(const std::string &path)
{
    interprocess::file_mapping  *file   = new interprocess::file_mapping(path.c_str(), interprocess::read_only);
    interprocess::mapped_region *region = new interprocess::mapped_region(*file,       interprocess::read_only);
    
    MemoryMap *mm = new MemoryMap(path, file, region);
    mm->_size = region->get_size();

    return mm;
}

MemoryMap::MemoryMap(const string &path, interprocess::file_mapping *file, interprocess::mapped_region *region)
{
    _path = path;
    _file = file;
    _region = region;
    _start = (char*)_region->get_address();
}
