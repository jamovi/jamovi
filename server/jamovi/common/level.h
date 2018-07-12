
#ifndef LEVEL_H
#define LEVEL_H

#include <string>
#include <sstream>


class LevelData
{
public:
    LevelData()
    {
        _type = 0;
        _ivalue = INT_MIN;
        _filtered = false;
    }

    LevelData(int value, const char *label, bool filtered = false)
    {
        _type = 0;
        _ivalue = value;
        _filtered = filtered;
        _label = std::string(label);

        std::stringstream ss;
        ss << value;
        _svalue = ss.str();
    }

    LevelData(const char* value, const char *label, bool filtered = false)
    {
        _type = 1;
        _filtered = filtered;
        _svalue = std::string(value);
        _label = std::string(label);
    }

    const char *svalue() const
    {
        return _svalue.c_str();
    }

    int ivalue() const
    {
        switch (_type)
        {
        case 0:
            return _ivalue;
        case 1:
            int v;
            if (sscanf(_svalue.c_str(), "%i", &v) == 1)
                return v;
            else
                return INT_MIN;
        }

        return INT_MIN;
    }

    bool filtered() const
    {
        return _filtered;
    }

    const char *label() const
    {
        return _label.c_str();
    }

    const bool hasLabelChanged() const
    {
        return _label != _svalue;
    }


private:
    int _type;
    int _ivalue;
    std::string _svalue;
    std::string _label;
    bool _filtered;
};

#endif // LEVEL_H
