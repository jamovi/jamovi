//
// Copyright (C) 2016 Jonathon Love
//

#include "enginecoms.h"

#include <streambuf>
#include <iostream>

#include "silkycoms.pb.h"
#include "analysisloader.h"

using namespace std;
using namespace silkycoms;

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
        std::cout << "failed to parse message";
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
        std::cout << "failed to parse message";
        std::cout << "\n";
        std::cout.flush();
        return;
    }

    Analysis *analysis = AnalysisLoader::create(analysisRequest.id(), analysisRequest.name(), analysisRequest.ns(), analysisRequest.options());
    analysisRequested(request.id(), analysis);
}
