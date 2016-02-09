//
// Copyright (C) 2016 Jonathon Love
//

#include "enginer.h"

using namespace std;

RInside *EngineR::_rInside = NULL;

void EngineR::run(Analysis &analysis)
{
    if (_rInside == NULL)
        _rInside = new RInside();

    _rInside->parseEvalQNT("print(1 + 2)");
}
