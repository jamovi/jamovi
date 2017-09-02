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

        char url[512];
        char path[512];

        if (argc == 3)
        {
            int urlc  = sscanf(argv[1], "--con=%511s", url);
            int pathc = sscanf(argv[2], "--path=%511s", path);

            if (urlc == 1 && pathc == 1)
            {
                e.setConnection(string(url));
                e.setPath(string(path));
                e.start();
            }
            else
            {
                throw runtime_error("Usage: engine --con=ipc://...  --path=PATH \n");
            }
        }
        else
        {
            throw runtime_error("Usage: engine --con=ipc://... --path=PATH \n");
        }

    }
    catch (const exception &e)
    {
        cerr << e.what();
        return 1;
    }

    return 0;
}
