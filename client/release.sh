#!/bin/bash

mkdir -p www
rm -rf www/*
mkdir -p www/assets

cp *.html www/
cp *.css  www/
cp *.js   www/


for file in assets/*; do
    crc=`crc32 "$file"`
    base=$(basename $file)
    name=${base%.*}
    ext=${base##*.}
    cp $file www/assets/$name-$crc.$ext
    for mod_file in www/*.{css,js}; do
        sed --in-place "s|$file\(\?v=[a-z0-9]\{8\}\)\?|assets/$name-$crc.$ext|g" "$mod_file"
    done
done

# rename the css files with their crc
for file in *.{css,js}; do
    crc=`crc32 "$file"`
    base=$(basename $file)
    name=${base%.*}
    ext=${base##*.}
    mv www/$base www/$name-$crc.$ext
    for mod_file in www/*.html; do
        sed --in-place "s|$file\(\?v=[a-z0-9]\{8\}\)\?|$name-$crc.$ext|g" "$mod_file"
    done
done
