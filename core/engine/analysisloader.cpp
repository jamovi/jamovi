//
// Copyright (C) 2016 Jonathon Love
//

#include "analysisloader.h"

Analysis *AnalysisLoader::create(int id, const std::string &name, const std::string &ns, const std::string &options)
{
    return new Analysis(id, name,  ns, options);
}
