//
// Copyright (C) 2016 Jonathon Love
//

#include "coms.h"

#include <streambuf>
#include <iostream>
#include <cstdlib>

#include <nanomsg/nn.h>
#include <nanomsg/pair.h>

#include "exceptions.h"

using namespace std;
using namespace jamovi::coms;

class MemoryBuffer : public std::streambuf
{
public:
    MemoryBuffer(char* data, int len) {
        this->setg(data, data, data + len);
    }
};

AnalysisRequest Coms::parse(char* buffer, size_t nbytes)
{
    AnalysisRequest request;
    ComsMessage message;
    MemoryBuffer buf1(buffer, nbytes);
    istream is1(&buf1);

    if (message.ParseFromIstream(&is1))
    {
        string payload = message.payload();
        MemoryBuffer buf2((char*)payload.c_str(), payload.size());
        istream is2(&buf2);

        request.ParseFromIstream(&is2);
    }

    return request;
}

void Coms::stringify(const string &results, bool complete, string &dest)
{
    ComsMessage message;
    message.set_payload(results);
    message.set_payloadtype("AnalysisResponse");
    message.set_status(complete ? Status::COMPLETE : Status::IN_PROGRESS);
    message.SerializeToString(&dest);
}

void ComsNN::connect(const string &path)
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

void ComsNN::send(const string &results, bool complete)
{
    string data;
    stringify(results, complete, data);
    nn_send(_socket, data.data(), data.size(), 0);
}

AnalysisRequest ComsNN::read()
{
    AnalysisRequest request;

    while (true)
    {
        char *buf = NULL;
        int nbytes = nn_recv(_socket, &buf, NN_MSG, 0);

        if (nbytes >= 0)
        {
            request = parse(buf, nbytes);
            nn_freemsg(buf);
            break;
        }
    }

    return request;
}

void ComsNN::close()
{
    nn_term();
}

#ifndef _WIN32

using boost::asio::local::stream_protocol;

void ComsDS::connect(const string &path)
{
    _ep = stream_protocol::endpoint(path);
    _stream = stream_protocol::iostream(_ep);

    if ( ! _stream)
    {
        throw UnableToConnectException(/*_stream.error().message()*/);
    }
}

void ComsDS::send(const string &results, bool complete)
{
    string data;
    stringify(results, complete, data);

    uint32_t n = data.size();
    _stream.write((char*)&n, 4);
    _stream << data;
    _stream.flush();
}

AnalysisRequest ComsDS::read()
{
    uint32_t nbytes;
    size_t read;

    _stream.read((char*)&nbytes, 4);
    read = _stream.gcount();

    if (read != 4)
        throw ConnectionLostException();

    _stream.read(_buffer, nbytes);
    read = _stream.gcount();

    if (read != nbytes)
        throw ConnectionLostException();

    return parse(_buffer, nbytes);
}

void ComsDS::close()
{
    _stream.close();
}

#endif
