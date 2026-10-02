//
// Copyright (C) 2016 Jonathon Love
//

#include "memorymapw.h"

#include <stdexcept>
#include <boost/nowide/fstream.hpp>

#ifdef __linux__
#include <fcntl.h>
#include <unistd.h>
#endif

using namespace std;
using namespace boost;

static bool extendFile(const string &path, unsigned long long size)
{
#ifdef __linux__
    // reserve the space up front. a sparse file on a full disk (or a full
    // tmpfs) is otherwise only discovered when a page of the mapping is
    // first written to, at which point the process receives a SIGBUS
    int fd = open(path.c_str(), O_RDWR);
    if (fd == -1)
        return false;
    int result = posix_fallocate(fd, 0, size);
    ::close(fd);
    return result == 0;
#else
    nowide::fstream stream;
    stream.open(path.c_str(), ios::in | ios::out);
    stream.seekg(size - 1);
    stream.put('\0');
    stream.close();
    return ! stream.fail();
#endif
}

MemoryMapW::MemoryMapW(const string &path, interprocess::file_mapping *file, interprocess::mapped_region *region)
    : MemoryMap(path, file, region)
{
    _cursor = _start + MM_START_OFFSET;
    _end   = _start + _region->get_size();
}

MemoryMapW *MemoryMapW::create(const string &path, unsigned long long size)
{
    nowide::fstream stream;
    stream.open(path.c_str(), ios::in | ios::out | ios::trunc);

    stream.put('j');
    stream.put('a');
    stream.put('m');
    stream.put('o');
    stream.put('v');
    stream.put('i');
    stream.put(MM_VERSION_MAJOR);
    stream.put(MM_VERSION_MINOR);
    stream.close();

    if (stream.fail())
        throw runtime_error("Could not create memory segment");

    if ( ! extendFile(path, size))
        throw runtime_error("Could not allocate memory segment");

    interprocess::file_mapping *file;

#ifdef _WIN32
    file = new interprocess::file_mapping(nowide::widen(path).c_str(), interprocess::read_write);
#else
    file = new interprocess::file_mapping(path.c_str(), interprocess::read_write);
#endif

    interprocess::mapped_region *region = new interprocess::mapped_region(*file,       interprocess::read_write, 0, size);

    MemoryMapW *mm = new MemoryMapW(path, file, region);
    mm->_size = size;

    return mm;
}

void MemoryMapW::enlarge(int percent)
{
    flush();

    size_t newSize = (_size * (100 + percent)) / 100;
    if ((newSize % 8) != 0)
        newSize += 8 - (newSize % 8);

    //cout << "enlarging memory map to " << newSize << "\n";
    //cout.flush();

    char *cursorOffset = base<char>(_cursor);

    // the file must be unmapped before it can be extended (under windows)

    delete _region;
    delete _file;
    _region = NULL;
    _file = NULL;

    // if the file can't be extended, we remap it at its existing size, so
    // the memory map remains usable, and then throw

    bool extended = extendFile(_path, newSize);
    if (extended)
        _size = newSize;

#ifdef _WIN32
    _file = new interprocess::file_mapping(nowide::widen(_path).c_str(), interprocess::read_write);
#else
    _file = new interprocess::file_mapping(_path.c_str(), interprocess::read_write);
#endif

    _region = new interprocess::mapped_region(*_file,       interprocess::read_write, 0, _size);

    _start = (char*)_region->get_address();
    _cursor = resolve<char>(cursorOffset);
    _end = _start + _region->get_size();

    if ( ! extended)
        throw runtime_error("Could not enlarge memory segment");
}

void MemoryMapW::flush()
{
    if (_region != NULL)
        _region->flush(0, _region->get_size(), false);
}

void MemoryMapW::close()
{
    delete _region;
    delete _file;
    _region = NULL;
    _file = NULL;
}
