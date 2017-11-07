//
// Copyright (C) 2017 Damian Dropmann
//

#include "host.h"

#ifdef _WIN32
#include <windows.h>
#include <tlhelp32.h>
#else
#include <unistd.h>
#endif

bool Host::isOrphan()
{
#ifdef _WIN32

    static DWORD ppid = 0;

    if (ppid == 0) {
        HANDLE h = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        PROCESSENTRY32 pe = { 0 };
        pe.dwSize = sizeof(PROCESSENTRY32);
        DWORD pid = GetCurrentProcessId();

         if( Process32First(h, &pe)) {
             do {
                 if (pe.th32ProcessID == pid) {
                     ppid = pe.th32ParentProcessID;
                     break;
                 }
             } while( Process32Next(h, &pe));
         }

         CloseHandle(h);
    }

    if (ppid != 0) {
        HANDLE h = OpenProcess(PROCESS_QUERY_INFORMATION, false, ppid);
        DWORD exitCode = 0;
        if (GetExitCodeProcess(h, &exitCode))
                return exitCode != STILL_ACTIVE;
    }
    return false;

#else
    // ppid changes when parent dies
    static pid_t ppid = getppid();
    return ppid != getppid();

#endif
}
