//
// Copyright (C) 2016 Jonathon Love
//

#ifndef Utils_H
#define Utils_H

#include <string>

class Utils
{
public:
    static unsigned long currentPID();
    static unsigned long parentPID();
    static bool isParentAlive();
    static std::string makeRelative(const std::string &from, const std::string &to);
};

#endif //Utils_H
