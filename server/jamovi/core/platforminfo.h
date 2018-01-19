//
// Copyright (C) 2016 Jonathon Love
//

#ifndef INFO_H
#define INFO_H

#include <list>
#include <string>
#include <sstream>

class PlatformInfo
{
public:

    static std::list<std::string> platform() {
        std::list<std::string> p;
#ifdef _WIN32
        p.push_back("win64");
#elif defined(__APPLE__)
        p.push_back("macos");
#else
        p.push_back("linux");
        std::ostringstream ss;
        ss << "linux" << __GNUC__ << "." << __GNUC_MINOR__;
        p.push_back(ss.str());
#endif
        return p;
    };
};

#endif // DATASETW_H
