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
