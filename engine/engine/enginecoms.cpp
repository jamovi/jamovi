//
// Copyright (C) 2016 Jonathon Love
//

#include "enginecoms.h"

#include <streambuf>
#include <iostream>
#include <cstdlib>

#include "jamovi.pb.h"
#include "analysis.h"

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
    ComsMessage request;

    MemoryBuffer buf1(data, len);
    istream is1(&buf1);

    if ( ! request.ParseFromIstream(&is1))
    {
        std::cout << "EngineComs::parse(); failed to parse message";
        std::cout << "\n";
        std::cout.flush();
        return;
    }

    AnalysisRequest analysisRequest;

    string payload = request.payload();
    MemoryBuffer buf2((char*)payload.c_str(), payload.size());
    istream is2(&buf2);

    if ( ! analysisRequest.ParseFromIstream(&is2))
    {
        std::cout << "EngineComs::parse(); failed to parse message";
        std::cout << "\n";
        std::cout.flush();
        return;
    }

    if (analysisRequest.restartengines())
    {
        restartRequested();
        return;
    }

    std::string options;
    analysisRequest.options().SerializeToString(&options);

    Analysis *analysis = new Analysis(
        analysisRequest.analysisid(),
        analysisRequest.name(),
        analysisRequest.ns(),
        options,
        analysisRequest.revision());

    analysis->instanceId = analysisRequest.instanceid();
    analysis->perform = analysisRequest.perform();
    analysis->clearState = analysisRequest.clearstate();

    analysis->path = analysisRequest.path();
    analysis->format = analysisRequest.format();
    analysis->part = analysisRequest.part();

    if (analysisRequest.changed_size() > 0)
        analysis->changed.assign(analysisRequest.changed().begin(), analysisRequest.changed().end());

    analysisRequested(request.id(), analysis);
}
