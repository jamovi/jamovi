//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ANALYSIS_H
#define ANALYSIS_H

#include <string>
#include <list>

class Analysis
{
    friend class AnalysisLoader;

public:
    Analysis(int id, std::string name, std::string ns, std::string options, int revision);

    enum Type { R, Python };

    int id;
    std::string name;
    std::string ns;
    int revision;
    std::string options;
    std::string nameAndId;
    int perform;
    std::list<std::string> changed;
    bool clearState;

    bool requiresDataset;
    std::string instanceId;

    std::string path;
    std::string format;
    std::string part;

private:
    Type type;
};

#endif // ANALYSIS_H
