//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ENGINECOMS_H
#define ENGINECOMS_H

#include <string>
#include <boost/signals2.hpp>

#include "jamovi.pb.h"

class EngineComs
{
public:
    EngineComs();

    boost::signals2::signal<void (int messageId, jamovi::coms::AnalysisRequest &request)> analysisRequested;
    boost::signals2::signal<void ()> restartRequested;

    void parse(char *data, int len);

};

#endif // ENGINECOMS_H
