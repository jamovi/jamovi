//
// Copyright (C) 2016 Jonathon Love
//

#include "engine.h"

#include <cstdio>
#include <iostream>

#include <stdexcept>

using namespace std;

int main(int argc, char *argv[])
{
    try {

        Engine e;

        char buffer[32];

        if (argc == 2)
        {
            int count = sscanf(argv[1], "--con=%32s", buffer);
            if (count > 0)
            {
                e.setConnection(string(buffer));
                e.start();
            }
            else
            {
                throw runtime_error("Usage: engine --con=ipc://...\n");
            }
        }
        else
        {
            throw runtime_error("Usage: engine --con=ipc://...\n");
        }

    }
    catch (const exception &e)
    {
        cerr << e.what();
    }
}
