//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ENGINER_H
#define ENGINER_H

#include <RInside.h>

#undef Free
#undef ERROR

#include "analysis.h"

class EngineR
{
public:
    static void run(Analysis &analysis);
    
private:
    static std::string makeAbsolute(const std::string &path);
    static RInside *_rInside;
};

#endif // ENGINER_H
