//
// Copyright (C) 2016 Jonathon Love
//

#include "enginecoms.h"

#include <streambuf>
#include <iostream>

#include "enginecoms.pb.h"
#include "analysisloader.h"

using namespace std;

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
    Request request;
    
    MemoryBuffer buf(data, len);
    istream is(&buf);
    
    bool success = request.ParseFromIstream(&is);

    if (success)
    {
        Analysis *analysis = AnalysisLoader::create(request.analysis().id(), request.analysis().name(), request.analysis().ns(), request.analysis().options());
        analysisRequested(analysis);
        
        //request.PrintDebugString();
        //std::cout << "\n";
        //std::cout.flush();
    }
    else
    {
        std::cout << "failed to parse message";
        std::cout << "\n";
        std::cout.flush();
    }

}
