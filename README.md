
# jamovi

jamovi is a free and open statistics package, which is easy to use, and designed to be familiar to users of SPSS. It provides a spreadsheet editor, and a range of statistical analyses. jamovi can provide R syntax for each analysis that is run, and additional analyses for jamovi can be developed using the R language.

Come visit us at [jamovi.org](https://www.jamovi.org).

## running

the easiest way to build and work on jamovi, is to build it as a docker container. clone this repo (and submodules), and then build it with:

```
git clone https://github.com/jamovi/jamovi.git
cd jamovi
git submodule update --init --recursive
docker-compose build
```

once built, it can be run with:

```
docker-compose up
```

this launches an embedded web-server, and jamovi can be accessed with a web-browser at the url http://localhost:41337

## building

it's possible to modify the source code, and rebuild the docker image, to try out your changes -- however this can be time consuming. it's often easier to just rebuild the component of interest, rather than rebuilding everything.

to this end, a `build` command is available from *inside* the container. the default configuration mounts the jamovi source folder (i.e. this repo) as a volume inside the container, and the `build` command uses it (including any changes you make) to rebuild the component of interest.

the following commands are available:

```
docker-compose exec jamovi build server
docker-compose exec jamovi build readstat
docker-compose exec jamovi build engine
docker-compose exec jamovi build compiler
docker-compose exec jamovi build jmvcore
docker-compose exec jamovi build jmv
docker-compose exec jamovi build scatr
docker-compose exec jamovi build client
```

note that these require that the docker container is running. depending on which component has been rebuilt, it may be necessary to restart the docker container for the changes to take effect (`docker-compose restart`).
