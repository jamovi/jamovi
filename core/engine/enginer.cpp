//
// Copyright (C) 2016 Jonathon Love
//

#include "enginer.h"

#include <boost/filesystem.hpp>

#include "boost/nowide/cstdlib.hpp"
#include "settings.h"
#include "dirs2.h"

using namespace std;
using namespace boost;

RInside *EngineR::_rInside = NULL;

void EngineR::run(Analysis &analysis)
{
    if (_rInside == NULL)
    {
        string setting = Settings::get("R_HOME", "");
        if (setting != "")
        {
            filesystem::path path = setting;
            if (path.is_relative())
            {
                filesystem::path here = Dirs2::exeDir();
                path = here / path;
            }
        
            nowide::setenv("R_HOME", path.generic_string().c_str(), 1);
        }
        
        _rInside = new RInside();
    }

    _rInside->parseEvalQNT("print(1 + 2)");
}
