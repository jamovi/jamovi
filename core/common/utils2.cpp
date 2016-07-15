
#include "utils2.h"

#ifdef _WIN32
#include <windows.h>
#include <tlhelp32.h>
#else
#include "unistd.h"
#endif

#include <boost/filesystem.hpp>

namespace fs = boost::filesystem;

unsigned long Utils2::currentPID()
{
#ifdef _WIN32
	return GetCurrentProcessId();
#else
	return getpid();
#endif
}

unsigned long Utils2::parentPID()
{
#ifdef _WIN32
	HANDLE h = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	PROCESSENTRY32 pe = { 0 };
	pe.dwSize = sizeof(PROCESSENTRY32);

    unsigned long pid = currentPID();
	unsigned long ppid = 0;

	if (Process32First(h, &pe))
	{
		do
		{
			if (pe.th32ProcessID == pid)
			{
				ppid = pe.th32ParentProcessID;
				break;
			}

		} while( Process32Next(h, &pe));
	}

	CloseHandle(h);

	return ppid;

#else

	return getppid();

#endif
}

bool Utils2::isParentAlive()
{
#ifdef _WIN32

    static unsigned long ppid = parentPID();
	static void* handle = NULL;

	if (handle == NULL && ppid != 0)
		handle = OpenProcess(PROCESS_QUERY_INFORMATION, FALSE, ppid);

	if (handle != NULL)
	{
		BOOL ok;
		DWORD exit;

		ok = GetExitCodeProcess(handle, &exit);

		return ( ! ok) || exit == STILL_ACTIVE;
	}

	return FALSE;

#else

	return getppid() != 1;

#endif
}

std::string Utils2::makeRelative(const std::string &fromPath, const std::string &toPath)
{
   // Start at the root path and while they are the same then do nothing then when they first
   // diverge take the remainder of the two path and replace the entire from path with ".."
   // segments.

   fs::path from = fromPath;
   fs::path to = toPath;

   fs::path::const_iterator fromIter = from.begin();
   fs::path::const_iterator toIter = to.begin();

   // Loop through both
   while (fromIter != from.end() && toIter != to.end() && (*toIter) == (*fromIter))
   {
      ++toIter;
      ++fromIter;
   }

   fs::path finalPath;
   while (fromIter != from.end())
   {
      finalPath /= "..";
      ++fromIter;
   }

   while (toIter != to.end())
   {
      finalPath /= *toIter;
      ++toIter;
   }

   return finalPath.generic_string();
}
