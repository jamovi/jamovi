//
// Copyright (C) 2016 Jonathon Love
//

#ifndef UTILS2_H
#define UTILS2_H

#include <string>

class Utils2
{
public:
    static unsigned long currentPID();
    static unsigned long parentPID();
    static bool isParentAlive();
    static std::string makeRelative(const std::string &from, const std::string &to);
};

#endif //UTILS2_H
