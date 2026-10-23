# list available commands
default:
    @just --list

# run jamovi (pass extra args through to `docker compose up`, e.g. `just run --build`)
run *args:
    docker compose --profile main up {{args}}

# build the jamovi image
build *args:
    docker compose --profile main build {{args}}

# run jamovi in dev mode, with vite serving the client for hot-reloading
dev *args:
    docker compose --profile dev up {{args}}

# run the test suite
test *args:
    docker compose --profile tests up {{args}}

# extract translatable strings and update the i18n catalogs (i18n/src, and the jmv and plots modules)
# (the client is run from the parent directory, so references read jamovi/client/..., as in the existing catalogs)
update-i18n:
    [ -d i18n/node_modules ] || npm ci --prefix i18n
    [ -d jamovi-compiler/node_modules ] || npm ci --prefix jamovi-compiler
    cd .. && node jamovi/i18n/index.js --update jamovi/i18n/src --source 'jamovi/client/{main,analysisui,resultsview}/**/*.ts' --pysource 'jamovi/server/jamovi/server/**/*.py'
    node jamovi-compiler/index.js --i18n jmv --update
    node jamovi-compiler/index.js --i18n plots --update
