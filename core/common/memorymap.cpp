//
// Copyright (C) 2016 Jonathon Love
//

#include "memorymap.h"

#include <boost/nowide/fstream.hpp>

using namespace std;
using namespace boost;

MemoryMap::MemoryMap(const string &path, interprocess::file_mapping *file, interprocess::mapped_region *region)
{
    _path = path;
    _file = file;
    _region = region;
    _start = (char*)_region->get_address();
}
