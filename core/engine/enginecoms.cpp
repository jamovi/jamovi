//
// Copyright (C) 2016 Jonathon Love
//

#include "enginecoms.h"
#include "enginecoms.pb.h"

#include <streambuf>
#include <iostream>

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
        request.PrintDebugString();
    else
        std::cout << "failed to parse message";
    
    std::cout << "\n";
    std::cout.flush();
}
