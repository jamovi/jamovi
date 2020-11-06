//
// Copyright (C) 2016 Jonathon Love
//

#include "memorymap.h"

using namespace std;
using namespace boost;

MemoryMap *MemoryMap::attach(const std::string &path)
{
    interprocess::file_mapping  *file   = new interprocess::file_mapping(path.c_str(), interprocess::read_only);
    interprocess::mapped_region *region = new interprocess::mapped_region(*file,       interprocess::read_only);

    MemoryMap *mm = new MemoryMap(path, file, region);
    mm->_size = region->get_size();
    mm->check();

    return mm;
}

MemoryMap::MemoryMap(const string &path, interprocess::file_mapping *file, interprocess::mapped_region *region)
{
    _path = path;
    _file = file;
    _region = region;
    _start = (char*)_region->get_address();
}

MemoryMap::~MemoryMap()
{
    delete _region;
    delete _file;
    _region = NULL;
    _file = NULL;
}

void MemoryMap::check() const
{
    char match[] = "jamovi";
    if (memcmp(_start, match, 6) != 0)
        throw runtime_error("Corrupt memory segment");
    char major = _start[6];
    char minor = _start[7];
    if (major > MM_VERSION_MAJOR)
        throw runtime_error("Memory segment version is too new");
}
