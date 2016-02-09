
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
    _cursor = _start;
    _end   = _start + _region->get_size();
}

MemoryMap *MemoryMap::create(const string &path, unsigned long long size)
{
    nowide::fstream stream;
    stream.open(path.c_str(), ios::in | ios::out | ios::trunc);
    stream.seekg(size - 1);
    stream.put('\0');
    stream.close();

    interprocess::file_mapping  *file   = new interprocess::file_mapping(path.c_str(), interprocess::read_write);
    interprocess::mapped_region *region = new interprocess::mapped_region(*file,       interprocess::read_write, 0, size);
    
    MemoryMap *mm = new MemoryMap(path, file, region);
    mm->_size = size;

    return mm;
}

void MemoryMap::enlarge(int percent)
{
    flush();
    
    delete _region;
    delete _file;
    
    size_t newSize = (_size * (100 + percent)) / 100;
    if ((newSize % 8) != 0)
        newSize += 8 - (newSize % 8);
        
    //cout << "enlarging memory map to " << newSize << "\n";
    //cout.flush();
    
    nowide::fstream stream;
    stream.open(_path.c_str(), ios::in | ios::out);
    stream.seekg(newSize - 1);
    stream.put('\0');
    stream.close();

    _file   = new interprocess::file_mapping(_path.c_str(), interprocess::read_write);
    _region = new interprocess::mapped_region(*_file,       interprocess::read_write, 0, newSize);
    
    char *cursorOffset = base<char>(_cursor);

    _size = newSize;
    
    _start = (char*)_region->get_address();
    _cursor = resolve<char>(cursorOffset);
    _end = _start + _region->get_size();
}

void MemoryMap::flush()
{
    _region->flush(0, _region->get_size(), false);
}

