//
// Copyright (C) 2016 Jonathon Love
//

#include "enginecoms.h"

#include <streambuf>
#include <iostream>
#include <cstdlib>

#include <nanomsg/nn.h>
#include <nanomsg/pair.h>

#include "jamovi.pb.h"

using namespace std;
using namespace jamovi::coms;

class MemoryBuffer : public streambuf
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

void EngineComs::connect(const string &path)
{
    _socket = nn_socket(AF_SP, NN_PAIR);
    if (_socket < 0)
        throw runtime_error("Unable to connect : could not create socket");

    int timeout;

    timeout = 1500;
    nn_setsockopt(_socket, NN_SOL_SOCKET, NN_SNDTIMEO, &timeout, sizeof(timeout));

    timeout = 500;
    nn_setsockopt(_socket, NN_SOL_SOCKET, NN_RCVTIMEO, &timeout, sizeof(timeout));

    _connId = nn_connect(_socket, path.c_str());
    if (_connId < 0)
        throw runtime_error("Unable to connect : could not connect to endpoint");
}

void EngineComs::send(const string &results, bool complete)
{
    ComsMessage message;

    message.set_payload(results);
    message.set_payloadtype("AnalysisResponse");
    message.set_status(complete ? Status::COMPLETE : Status::IN_PROGRESS);

    string data;
    message.SerializeToString(&data);
    nn_send(_socket, data.data(), data.size(), 0);
}

AnalysisRequest EngineComs::read()
{
    AnalysisRequest request;

    while (true)
    {
        char *buf = NULL;
        int nbytes = nn_recv(_socket, &buf, NN_MSG, 0);

        if (nbytes >= 0)
        {
            ComsMessage message;
            MemoryBuffer buf1(buf, nbytes);
            istream is1(&buf1);

            if (message.ParseFromIstream(&is1))
            {
                string payload = message.payload();
                MemoryBuffer buf2((char*)payload.c_str(), payload.size());
                istream is2(&buf2);

                request.ParseFromIstream(&is2);
                break;
            }

            nn_freemsg(buf);
        }
    }

    return request;
}

void EngineComs::close()
{
    nn_term();
}
