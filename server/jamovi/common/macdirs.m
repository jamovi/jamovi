
#include "macdirs.h"

#include <sys/syslimits.h>
#include <Foundation/NSFileManager.h>

char path_buffer[PATH_MAX];

char *macdirs_get(NSSearchPathDirectory dir)
{
    NSArray<NSString*> *paths = NSSearchPathForDirectoriesInDomains(dir, NSUserDomainMask, YES);
    NSString *path = [paths firstObject];
    int status = [path getCString:path_buffer maxLength:PATH_MAX encoding:NSUTF8StringEncoding];
    if (status)
        return path_buffer;
    else
        return NULL;
}

char *macdirs_documentsDir()
{
    return macdirs_get(NSDocumentDirectory);
}

char *macdirs_downloadsDir()
{
    return macdirs_get(NSDownloadsDirectory);
}

char *macdirs_desktopDir()
{
    return macdirs_get(NSDesktopDirectory);
}

char *macdirs_appSupportDir()
{
    return macdirs_get(NSApplicationSupportDirectory);
}

char *macdirs_homeDir()
{
    NSString *path = NSHomeDirectory();
    int status = [path getCString:path_buffer maxLength:PATH_MAX encoding:NSUTF8StringEncoding];
    if (status)
        return path_buffer;
    else
        return NULL;
}
