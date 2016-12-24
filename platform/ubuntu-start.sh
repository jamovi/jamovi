#!/bin/sh
export FONTCONFIG_PATH=$SNAP/etc/fonts
export FONTCONFIG_FILE=$SNAP/etc/fonts/fonts.conf
export XDG_DATA_HOME=$SNAP/usr/share
# export LD_LIBRARY_PATH=$SNAP_LIBRARY_PATH:$SNAP/usr/lib/:$SNAP/lib/x86_64-linux-gnu/:$SNAP/usr/lib/x86_64-linux-gnu/:$SNAP/usr/lib/R/lib/:$SNAP/usr/lib/R/site-library/RInside/lib/
export JAMOVI_HOME=$SNAP/usr/lib/jamovi
export PYTHONPATH=$SNAP/usr/lib/jamovi/lib/python3.5
export R_HOME=$SNAP/usr/lib/R
export R_LIBS=/usr/lib/R/site-library:$SNAP/usr/lib/jamovi/modules/base/R

exec "$SNAP/usr/lib/jamovi/bin/electron" "$@"
