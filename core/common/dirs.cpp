//
// Copyright (C) 2016 Jonathon Love
//

#include "dirs.h"

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#include <shlwapi.h>
#elif defined(__APPLE__)
#include <pwd.h>
#include <CoreServices/CoreServices.h>
#include <libproc.h>
#else
#include <pwd.h>
#endif

#include <boost/filesystem.hpp>
#include <boost/system/error_code.hpp>
#include <boost/nowide/convert.hpp>

#include "appinfo.h"
#include "utils.h"

using namespace std;
using namespace boost;

string Dirs::_appDataDir = "";
string Dirs::_tempDir = "";
string Dirs::_exePath = "";
string Dirs::_exeDir = "";
string Dirs::_rHomeDir = "";
string Dirs::_libraryDir = "";
string Dirs::_documentsDir = "";
string Dirs::_homeDir = "";
string Dirs::_desktopDir = "";

string Dirs::appDataDir()
{
	if (Dirs::_appDataDir == "")
	{
		string dir;
		filesystem::path path;

#ifdef _WIN32

		TCHAR buffer[MAX_PATH];

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_APPDATA, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
            "Could not retrieve app data directory";

		dir = nowide::narrow(buffer);
		dir += "/" + AppInfo::name + "/" + AppInfo::getShortDesc();

		path = nowide::widen(dir);

#elif defined(__APPLE__)

        path = dir = homeDir() + "/Library/Application Support/" + AppInfo::name + "/" + AppInfo::getShortDesc();

#else

		path = dir = homeDir() + "/." + AppInfo::name + "/" + AppInfo::getShortDesc();

#endif

		if ( ! filesystem::exists(path))
		{
			system::error_code ec;

			filesystem::create_directories(path, ec);

			if (ec)
                throw "could not create app data dir";
		}

		Dirs::_appDataDir = filesystem::path(dir).generic_string();
	}

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

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_APPDATA, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
            "Could not retrieve app data directory";

		dir = nowide::narrow(buffer);
		dir += "/" + AppInfo::name + "/temp";

		path = nowide::widen(dir);

#elif defined(__APPLE__)

        path = dir = homeDir() + "/Library/Application Support/" + AppInfo::name + "/temp";

#else

		path = dir = homeDir() + "/." + AppInfo::name + "/temp";

#endif

		if ( ! filesystem::exists(path))
		{
			system::error_code ec;

			filesystem::create_directories(path, ec);

			if (ec)
                throw "could not create app data dir";
		}

		Dirs::_tempDir = filesystem::path(dir).generic_string();
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
            throw runtime_error("could not retrieve exe dir");

        _exePath = nowide::narrow(path);

#elif defined(__APPLE__)

        unsigned long pid = Utils::currentPID();

        char buf[PROC_PIDPATHINFO_MAXSIZE];
        int ret = proc_pidpath (pid, buf, sizeof(buf));

        if (ret <= 0)
            throw runtime_error("could not retrieve exe path");

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
            throw runtime_error("could not retrieve exe dir");

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
            throw runtime_error("could not retrieve exe path");

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

string Dirs::libraryDir()
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

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_PERSONAL, NULL, SHGFP_TYPE_CURRENT, buffer);

		if ( ! SUCCEEDED(ret))
		    throw "Could not retrieve documents directory";

		dir = nowide::narrow(buffer);

#else

		dir = homeDir() + "/Documents";

#endif

		Dirs::_documentsDir = filesystem::path(dir).generic_string();
	}

	return Dirs::_documentsDir;
}

string Dirs::homeDir()
{
	if (Dirs::_homeDir == "")
	{
		string dir;

#ifdef _WIN32

		TCHAR buffer[MAX_PATH];

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_PROFILE, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
		    throw "Could not retrieve home directory";

		dir = nowide::narrow(buffer);

#else

		dir = string(getpwuid(getuid())->pw_dir);

#endif

		Dirs::_homeDir = filesystem::path(dir).generic_string();
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

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_DESKTOP, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
		    throw "Could not retrieve desktop";

		dir = nowide::narrow(buffer);

#else

		dir = string(getpwuid(getuid())->pw_dir) + "/Desktop";

#endif

		Dirs::_desktopDir = filesystem::path(dir).generic_string();
	}

	return Dirs::_desktopDir;
}
