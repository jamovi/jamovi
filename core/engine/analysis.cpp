//
// Copyright (C) 2016 Jonathon Love
//

#include "analysis.h"

Analysis::Analysis(int id, std::string name, std::string ns, std::string options)
{
    this->id = id;
    this->name = name;
    this->ns = ns;
    this->options = options;
}
