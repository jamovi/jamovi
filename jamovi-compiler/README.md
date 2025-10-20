
# jamovi-compiler

## installation

The jamovi-compiler requires that you have [nodejs](https://nodejs.org/en/) installed.

The jamovi-compiler can then be installed with the npm command:

    sudo npm install -g git+https://git@github.com/jamovi/jamovi-compiler.git

## use

Once installed, the jamovi-compiler can simply be invoked

    jmc

or if the target R package isn't the current directory

    jmc /path/to/package

## what it does

The jamovi-compiler looks for `.a.yaml` and `.r.yaml` files in your package's `inst/jamovi` folder. From these it generates header, body and UI files. For example, a package with the following files:

 - inst/jamovi/supertest.a.yaml
 - inst/jamovi/supertest.r.yaml

would result in:

 - R/supertest.h.R *
 - R/supertest.b.R
 - ui/supertest.options.js *
 - ui/supertest.src.js
 - inst/jamovi/supertest.js *

`.h.R`, `.options.js` and `.js` files are overwritten by the compiler each time (marked with a \*), and should not be edited. `.b.R` and `.src.js` files are only created if they don't already exist, and are intended to be edited.
