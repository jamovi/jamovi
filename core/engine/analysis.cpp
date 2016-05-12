//
// Copyright (C) 2016 Jonathon Love
//

#include "analysis.h"

#include <sstream>
#include <iomanip>

using namespace std;

Analysis::Analysis(int id, std::string name, std::string ns, std::string options)
{
    this->id = id;
    this->name = name;
    this->ns = ns;
    this->options = options;
    this->perform = 2;
    
    stringstream ss;
    ss << setfill('0') << setw(2);
    ss << id;
    ss << " ";
    ss << name;
    
    this->nameAndId = ss.str();

    this->requiresDataset = true;
    this->datasetId = "";
}
