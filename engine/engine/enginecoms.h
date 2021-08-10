//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ENGINECOMS_H
#define ENGINECOMS_H

#include <string>

#include "jamovi.pb.h"

class EngineComs
{
public:
    EngineComs();

    void connect(const std::string &path);
    jamovi::coms::AnalysisRequest read();
    void send(const std::string &results, bool complete);
    void close();

private:
    int _socket;
    int _connId;
};

#endif // ENGINECOMS_H
