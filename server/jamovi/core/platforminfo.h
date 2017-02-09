//
// Copyright (C) 2016 Jonathon Love
//

#ifndef INFO_H
#define INFO_H

#include <string>
#include <sstream>

class PlatformInfo
{
public:

    static std::string platform() {
#ifdef _WIN32
        return "win64";
#elif defined(__APPLE__)
        return "macos";
#else
        std::ostringstream ss;
        ss << "linux" << __GNUC__ << "." << __GNUC_MINOR__;
        return ss.str();
#endif
    };
};

#endif // DATASETW_H
