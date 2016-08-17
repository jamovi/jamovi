//
// Copyright (C) 2016 Jonathon Love
//

#ifndef SETTINGS_H
#define SETTINGS_H

#include <string>
#include <boost/property_tree/ptree.hpp>

class Settings
{
public:
    static std::string get(const std::string &key, const std::string &defaul);

private:
    static Settings *_settings;
    Settings();
    boost::property_tree::ptree _pt;
};

#endif // SETTINGS_H
