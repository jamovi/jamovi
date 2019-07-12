#!/bin/sh

for file in assets/*; do
    crc=`crc32 "$file"`
    for css_file in *.css; do
        sed --in-place "s|$file\(\?v=[a-z0-9]\{8\}\)\?|$file?v=$crc|g" "$css_file"
    done
done

# rename the css files with their crc
for file in *.css; do
    crc=`crc32 "$file"`
    for html_file in *.html; do
        sed --in-place "s|$file\(\?v=[a-z0-9]\{8\}\)\?|$file?v=$crc|g" "$html_file"
    done
done

for file in *.js; do
    crc=`crc32 "$file"`
    for html_file in *.html; do
        sed --in-place "s|$file\(\?v=[a-z0-9]\{8\}\)\?|$file?v=$crc|g" "$html_file"
    done
done
