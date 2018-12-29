//
// Copyright (C) 2016 Jonathon Love
//

#include "analysis.h"

#include <sstream>
#include <iomanip>

using namespace std;

Analysis::Analysis(
  const string &sessionId,
  const string &instanceId,
  int analysisId,
  const string &name,
  const string &ns,
  const string &options,
  int revision)
{
    this->sessionId = sessionId;
    this->instanceId = instanceId;
    this->analysisId = analysisId;
    this->name = name;
    this->ns = ns;
    this->options = options;
    this->revision = revision;
    this->perform = 2;
    this->clearState = false;

    stringstream ss;
    ss << setfill('0') << setw(2);
    ss << analysisId;
    ss << " ";
    ss << name;

    this->nameAndId = ss.str();
    this->requiresDataset = true;
    this->instanceId = "";
}
