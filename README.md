
# jamovi

jamovi is a free and open statistics package, which is easy to use, and designed to be familiar to users of SPSS. It provides a spreadsheet editor, and a range of statistical analyses. jamovi can provide R syntax for each analysis that is run, and additional analyses for jamovi can be developed using the R language.

Come visit us at [jamovi.org](https://www.jamovi.org).

## running

the easiest way to build and work on jamovi, is to build it as a docker container. clone this repo (and submodules), and then build it with:

```bash
git clone https://github.com/jamovi/jamovi.git
cd jamovi
git submodule update --init --recursive
docker compose --profile main build
```

once built, it can be run with:

```bash
docker compose --profile main up
```

this launches an embedded web-server, and jamovi can be accessed with a web-browser at the url http://127.0.0.1:41337

## dev mode

jamovi can be run with a vite dev server serving the client files as follows:

```bash
docker compose --profile dev up
```
