//
// Copyright (C) 2016 Jonathon Love
//

#ifndef UTILS2_H
#define UTILS2_H

class Utils2
{
public:
    static unsigned long currentPID();
    static unsigned long parentPID();
    static bool isParentAlive();
};

#endif //UTILS2_H