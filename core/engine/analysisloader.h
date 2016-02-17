//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ANALYSISLOADER_H
#define ANALYSISLOADER_H

#include "analysis.h"

class AnalysisLoader
{
public:
    static Analysis *create(int id, const std::string &name, const std::string &ns);
    
};

#endif // ANALYSISLOADER_H
