//
// Copyright (C) 2016 Jonathon Love
//

#include "dirs.h"

#ifdef _WIN32
#include <windows.h>
#include <Shlobj.h>
#include <shlwapi.h>
#elif defined(__APPLE__)
#include <pwd.h>
#include <CoreServices/CoreServices.h>
#include <libproc.h>
#include "macdirs.h"
#else
#include <pwd.h>
#endif

#include <sstream>
#include <boost/filesystem.hpp>
#include <boost/system/error_code.hpp>
#include <boost/nowide/convert.hpp>

#include "utils.h"

using namespace std;
using namespace boost;

string Dirs::_appDataDir = "";
string Dirs::_tempDir = "";
string Dirs::_exePath = "";
string Dirs::_exeDir = "";
string Dirs::_rHomeDir = "";
string Dirs::_documentsDir = "";
string Dirs::_downloadsDir = "";
string Dirs::_homeDir = "";
string Dirs::_desktopDir = "";

void Dirs::throwError(const string &message, int code)
{
    if (code == 0)
    {
        throw runtime_error(message);
    }
    else
    {
        stringstream ss;
        ss << message << "(" << code << ")";
        throw runtime_error(ss.str());
    }
}

string Dirs::appDataDir(bool sh0rt)
{
    if (Dirs::_appDataDir == "")
    {
        string dir;
        filesystem::path path;

#ifdef _WIN32
        TCHAR buffer[MAX_PATH];
        HRESULT ret = SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, 0, buffer);
        if ( ! SUCCEEDED(ret))
            throwError("Could not retrieve app data directory", ret);
        dir = nowide::narrow(buffer);
        dir += "/jamovi";
        path = nowide::widen(dir);
#elif defined(__APPLE__)
        char *cpath = macdirs_appSupportDir();
        if (cpath == NULL)
            throwError("Could not retrieve app data directory", 0);
        dir = cpath;
        dir += "/jamovi";
        path = dir;
#else
        path = dir = homeDir() + "/.jamovi";
#endif

        if ( ! filesystem::exists(path))
        {
            system::error_code ec;

            filesystem::create_directories(path, ec);

            if (ec)
                throwError("Could not create app data dir", ec.value());
        }

#ifdef _WIN32
        std::replace( dir.begin(), dir.end(), '\\', '/');
#endif

        Dirs::_appDataDir = dir;
    }

#ifdef _WIN32
    if (sh0rt)
    {
        wstring wide = nowide::widen(Dirs::_appDataDir);
        long   length = 0;
        TCHAR* buffer = NULL;
        length = GetShortPathName(wide.c_str(), NULL, 0);
        buffer = new TCHAR[length];
        length = GetShortPathName(wide.c_str(), buffer, length);
        string sh = nowide::narrow(buffer);
        delete buffer;

        return sh;
    }
#endif

    return Dirs::_appDataDir;
}

string Dirs::tempDir()
{
    if (Dirs::_tempDir == "")
    {
        string dir;
        filesystem::path path;

#ifdef _WIN32

        TCHAR buffer[MAX_PATH];

        HRESULT ret = SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, 0, buffer);

        if ( ! SUCCEEDED(ret))
            "Could not retrieve app data directory";

        dir = nowide::narrow(buffer);
        dir += "/jamovi/temp";

        path = nowide::widen(dir);

#elif defined(__APPLE__)

        path = dir = homeDir() + "/Library/Application Support/jamovi/temp";

#else

        path = dir = homeDir() + "/.jamovi/temp";

#endif

        if ( ! filesystem::exists(path))
        {
            system::error_code ec;

            filesystem::create_directories(path, ec);

            if (ec)
                throwError("Could not create temp dir", ec.value());
        }

        #ifdef _WIN32
                std::replace( dir.begin(), dir.end(), '\\', '/');
        #endif

        Dirs::_tempDir = dir;
    }

    return Dirs::_tempDir;
}

string Dirs::exePath()
{
    if (Dirs::_exePath == "")
    {
#ifdef _WIN32

        HMODULE hModule = GetModuleHandleW(NULL);
        WCHAR path[MAX_PATH];

        int ret = GetModuleFileNameW(hModule, path, MAX_PATH);

        if (ret == 0)
            throwError("Could not retrieve exe dir", ret);

        _exePath = nowide::narrow(path);

#elif defined(__APPLE__)

        unsigned long pid = Utils::currentPID();

        char buf[PROC_PIDPATHINFO_MAXSIZE];
        int ret = proc_pidpath (pid, buf, sizeof(buf));

        if (ret <= 0)
            throwError("Could not retrieve exe path", ret);

        _exePath = string(buf);

#else

        char buf[1024];
        pid_t pid = getpid();

        int n = readlink("/proc/self/exe", buf, sizeof(buf));

        _exePath = string(buf, buf+n);

#endif
    }

    return _exePath;
}

string Dirs::exeDir()
{
    if (Dirs::_exeDir == "")
    {
#ifdef _WIN32
        HMODULE hModule = GetModuleHandleW(NULL);
        WCHAR path[MAX_PATH];

        int ret = GetModuleFileNameW(hModule, path, MAX_PATH);

        if (ret == 0)
            throwError("Could not retrieve exe dir", ret);

        string narrow = nowide::narrow(path);

        char buf[MAX_PATH];
        narrow.copy(buf, MAX_PATH);

        int last = 0;

        for (int i = 0; i < narrow.length(); i++) // normalize separators
        {
            if (buf[i] == '\\')
            {
                buf[i] = '/';
                last = i;
            }
        }

        _exeDir = string(buf, last);

#elif defined(__APPLE__)

        unsigned long pid = Utils::currentPID();

        char buf[PROC_PIDPATHINFO_MAXSIZE];
        int ret = proc_pidpath (pid, buf, sizeof(buf));

        if (ret <= 0)
            throwError("Could not retrieve exe path", ret);

        int last = strlen(buf);

        for (int i = last - 1; i > 0; i--) // remove executable name, leaving the dir
        {
            if (buf[i] == '/')
            {
                buf[i] = '\0';
                break;
            }
        }

        _exeDir = string(buf);

#else

        char buf[1024];
        pid_t pid = getpid();

        int n = readlink("/proc/self/exe", buf, sizeof(buf));

        for (int i = n - 1; i > 0; i--)
        {
            if (buf[i] == '/')  // lop the exe off, leaving the dir
            {
                buf[i] = '\0';
                break;
            }
        }

        _exePath = string(buf);

#endif
    }

    return _exeDir;
}

string Dirs::rHomeDir()
{
    // TODO
    return "";
}

string Dirs::documentsDir()
{
    if (Dirs::_documentsDir == "")
    {
        string dir;

#ifdef _WIN32
        TCHAR buffer[MAX_PATH];
        HRESULT ret = SHGetFolderPathW(NULL, CSIDL_PERSONAL, NULL, SHGFP_TYPE_CURRENT, buffer);
        if ( ! SUCCEEDED(ret))
            throwError("Could not retrieve documents directory", ret);
        dir = nowide::narrow(buffer);
#elif defined(__APPLE__)
        char *cpath = macdirs_documentsDir();
        if (cpath == NULL)
            throwError("Could not retrieve documents directory", 0);
        dir = cpath;
#else
        dir = homeDir() + "/Documents";
#endif

#ifdef _WIN32
        std::replace( dir.begin(), dir.end(), '\\', '/');
#endif

        Dirs::_documentsDir = dir;
    }

    return Dirs::_documentsDir;
}

string Dirs::downloadsDir()
{
    if (Dirs::_downloadsDir == "")
    {

        string dir;

#ifdef _WIN32
#ifdef __MINGW32__
        throwError("Not supported under mingw-w64 as far as i can tell", 0);
#else
        wchar_t* buffer;
        HRESULT ret = SHGetKnownFolderPath(FOLDERID_Downloads, 0, NULL, &buffer);
        if ( ! SUCCEEDED(ret))
            throwError("Could not retrieve downloads directory", ret);
        dir = nowide::narrow(buffer);
        CoTaskMemFree(buffer);
#endif
#elif defined(__APPLE__)
        char *cpath = macdirs_downloadsDir();
        if (cpath == NULL)
            throwError("Could not retrieve downloads directory", 0);
        dir = cpath;
#else
        dir = homeDir() + "/Downloads";
#endif

#ifdef _WIN32
        std::replace( dir.begin(), dir.end(), '\\', '/');
#endif

        Dirs::_downloadsDir = dir;
    }

    return Dirs::_downloadsDir;
}

string Dirs::homeDir()
{
    if (Dirs::_homeDir == "")
    {
        string dir;

#ifdef _WIN32
        TCHAR buffer[MAX_PATH];
        HRESULT ret = SHGetFolderPathW(NULL, CSIDL_PROFILE, NULL, 0, buffer);
        if ( ! SUCCEEDED(ret))
            throwError("Could not retrieve home directory", ret);
        dir = nowide::narrow(buffer);
#elif defined(__APPLE__)
        char *cpath = macdirs_homeDir();
        if (cpath == NULL)
            throwError("Could not retrieve home directory", 0);
        dir = cpath;
#else
        dir = string(getpwuid(getuid())->pw_dir);
#endif

#ifdef _WIN32
        std::replace( dir.begin(), dir.end(), '\\', '/');
#endif
        Dirs::_homeDir = dir;
    }

    return Dirs::_homeDir;
}

string Dirs::desktopDir()
{
    if (Dirs::_desktopDir == "")
    {

        string dir;

#ifdef _WIN32
        TCHAR buffer[MAX_PATH];
        HRESULT ret = SHGetFolderPathW(NULL, CSIDL_DESKTOP, NULL, 0, buffer);
        if ( ! SUCCEEDED(ret))
            throwError("Could not retrieve desktop directory", ret);
        dir = nowide::narrow(buffer);
#elif defined(__APPLE__)
        char *cpath = macdirs_desktopDir();
        if (cpath == NULL)
            throwError("Could not retrieve desktop directory", 0);
        dir = cpath;
#else
        dir = homeDir() + "/Desktop";
#endif

#ifdef _WIN32
        std::replace( dir.begin(), dir.end(), '\\', '/');
#endif
        Dirs::_desktopDir = dir;
    }

    return Dirs::_desktopDir;
}
