//
// Copyright (C) 2016 Jonathon Love
//

#include "enginecoms.h"

#include <streambuf>
#include <iostream>
#include <cstdlib>

#include "jamovi.pb.h"

using namespace std;
using namespace jamovi::coms;

class MemoryBuffer : public std::streambuf
{
public:
    MemoryBuffer(char* data, int len) {
        this->setg(data, data, data + len);
    }
};

EngineComs::EngineComs()
{
    GOOGLE_PROTOBUF_VERIFY_VERSION;
}

void EngineComs::parse(char *data, int len)
{
    ComsMessage message;

    MemoryBuffer buf1(data, len);
    istream is1(&buf1);

    if ( ! message.ParseFromIstream(&is1))
    {
        cerr << "EngineComs::parse(); failed to parse message\n";
        cerr.flush();
        return;
    }

    AnalysisRequest request;

    string payload = message.payload();
    MemoryBuffer buf2((char*)payload.c_str(), payload.size());
    istream is2(&buf2);

    if ( ! request.ParseFromIstream(&is2))
    {
        cerr << "EngineComs::parse(); failed to parse request\n";
        cerr.flush();
        return;
    }

    if (request.restartengines())
    {
        restartRequested();
        return;
    }

    analysisRequested(message.id(), request);
}
