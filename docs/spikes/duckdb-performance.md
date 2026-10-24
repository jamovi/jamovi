# Spike: can DuckDB storage match shared memory performance?

**Status:** planned · **Branch:** `duckdb` · **Time-box:** ~2 days of effort

## The question

jamovi's data sets can be stored in shared memory (`shmem`, the compiled
core) or in DuckDB (`duckdb`). The two have opposite strengths:

- shmem is fast at random access (single cells) and slow at bulk reads and writes
- DuckDB is slow at random access and fast at bulk reads and writes

`DataCache` is meant to close the gap for DuckDB. jamovi's access patterns
differ by operation, though:

- **scrolling the spreadsheet:** reads of row × column blocks, mostly sequential with jumps
- **editing cells:** small, random writes
- **computed variables:** row-wise (`Column.recalc()` evaluates and writes one row at a time), column-wise, or both
- **imports:** typically column-wise bulk writes

The open question is whether DuckDB can reach shmem-like performance across
all of these, and what it would take: caching, write buffering, batching,
connection handling. This spike should answer it with measurements, not
production code.

## What a fresh session needs to know

- **Choosing storage:** `JAMOVI_STORAGE=shmem|duckdb`, read by
  `server/jamovi/server/storage.py`. It chooses both the store and the engine.
  It defaults to shmem when the compiled core is available, and duckdb otherwise.
- **Running without building (DuckDB only):** run `just test-local` from
  macOS or Linux. It generates `jamovi_pb2.py` with `protoc` and runs pytest
  with `uv`. The engine test also needs a jamovi modules root (by default
  `/Applications/jamovi.app/Contents/Resources/modules`) and the `DBI` and
  `duckdb` R packages on `R_LIBS`.
- **shmem requires the compiled core,** which in practice means Docker:
  `docker build -f docker/jamovi-Dockerfile -t jamovi/jamovi:<tag> .`, with
  submodules initialised recursively, then
  `docker run --rm -e JAMOVI_STORAGE=… jamovi/jamovi:<tag> "cd /usr/lib/jamovi/server && python3 -m pytest …"`.
  To try changed Python without rebuilding, mount the source folders over
  `/usr/lib/jamovi/server/jamovi/...`. Run both stores in the same container
  so the comparison is like for like.
- **DuckDB layout (`server/jamovi/server/dataset/duck*.py`):** each data set
  has the tables `sheet_meta_{id}`, `sheet_columns_{id}`,
  `sheet_data_{id}` and `sheet_levels_{id}`. Data columns are named by column
  iid, and rows are keyed by `index`. Text data is stored by level *import
  value* and returned as the level label. Version 1.4.2 is pinned.
- **Reads:** `DataCache` (`dataset/datacache.py`) caches 100 × 50 blocks,
  with an LRU of 9 blocks, filled by `DuckDataSet.get_range()`.
- **Writes:** `DuckDataSet.set_value()` runs one `UPDATE` per cell, plus
  level-count bookkeeping. When the levels change it rewrites them
  (`_write_levels_to_db`), and it then clears **the whole** cache. So
  `Column.recalc()` over N rows costs N `UPDATE`s plus N cache refills.
  Importers (`formatio/readstat.py`, CSV, …) also write cell by cell. The
  `test_readstat.py` tests take about 4 minutes on DuckDB.
- **Connections:** the DuckDB connection is opened lazily inside
  `attach()`, and closed (which writes to disk) when the last attach ends
  (`dataset/duckstore.py`). The engines read the database file
  read-only from separate processes, which can't happen while the server
  holds a read/write connection. Every `DataSetModel.attach()` (i.e. every
  client request) therefore pays for a connect and a close. Reads outside
  an attach open a short-lived read-only connection per query.
- **Known gaps (not part of this spike):** DuckDB missing values are not
  implemented (`missing_values` / `set_missing_values` are TODOs).
  `tests/test_undo.py` can't be imported on main either, and
  `tests/test_analyses.py` fails on main too.

## Plan

### 1. Benchmark harness

Add `server/jamovi/benchmarks/` (a plain script, not pytest), which:

- builds data sets of several sizes, e.g. 1k × 10, 100k × 50 and 1M × 20,
  with a mix of continuous, integer, nominal-integer, nominal-text and ID
  columns
- runs each workload below against **both** stores through the same API the
  server uses (`DataSetModel` / `Column`, with `attach()` as the controller
  does), so connection costs are included
- reports wall time (median of several runs) and, for DuckDB, the number of
  SQL statements (count them in `DuckStore.execute`)

### 2. Workloads

| # | Workload | Access pattern | How |
|---|---|---|---|
| W1 | Scroll | block reads, sequential with jumps | 50-row × 30-column viewport, moved 200 times, plus random jumps |
| W2 | Cell edits | random single-cell writes | 1,000 random `set_value`s, a mix of with and without levels, one attach each |
| W3 | Import | column-wise bulk writes | fill every column of an empty data set, the way the readers do (`set_value` per cell), and also as one column at a time (`set_values`) |
| W4 | Computed (row-wise) | read several columns, write one, per row | a computed column `A + B * 2`, `recalc()` |
| W5 | Computed (column-wise) | aggregate, then per row | `Z(A)` or `A - MEAN(A)` (`uses_column_formula`) |
| W6 | Filter refresh | whole-table update | add or change a filter, `refresh_filter_state()` |
| W7 | Attach/detach | connection cost | an empty `attach()`/detach loop |
| W8 (optional) | Engine read | bulk read from another process | R reading the columns for an analysis (DuckDB via DBI, shmem via the engine) |

### 3. Baseline

Run every workload on both stores at each size. Also profile DuckDB
(`cProfile`, plus statement counts) for the workloads where it loses badly.

### 4. Try fixes (prototype quality, one at a time, measured)

- **Write buffering, flushed on detach (the main candidate):** `set_value()`
  stops running SQL. It records the write in a pending overlay (per column:
  row → value) and keeps the level counts in memory. `detach()` (the last
  one, in `DuckStore`) writes everything in one go, before the connection
  closes, e.g. one `UPDATE … FROM` a registered Arrow or pandas frame per
  column, or an insert into a temporary table followed by an update, plus
  one write of each changed column's levels. Things to settle:
  - **Reads during the attach:** reads must see pending writes, so
    `get_value` and the cache consult the overlay first.
  - **Operations that read through SQL:** `refresh_filter_state()`, data
    type and measure type changes, and the level syncs read through SQL
    rather than the cache. They either flush first (a mid-attach flush),
    or get rewritten to work from the overlay.
  - **Read-only attaches:** these never flush.
  - **Concurrent attaches:** nested and concurrent attaches (the reference
    count) flush only when the last one detaches.
  - **Memory:** the overlay's memory when importing large files, and
    whether to flush when it grows past a threshold.
  - **Failures:** whether a failed flush loses the writes.
  - **The engine:** it reads after the detach, so it always sees flushed data.

  Measure it on W2 (where each request is one attach), W3 and W4.
- **Cache invalidation:** after a write, update the cached block in place (or
  drop just the affected blocks) rather than clearing the whole cache.
- **Cache shape:** block size and LRU size for scrolling; a column-shaped
  cache for column-wise workloads (W3, W5).
- **Column-wise APIs:** have `recalc()` and the importers use `set_values` /
  `get_values` for whole columns or row ranges, so DuckDB gets bulk operations.
- **Connection handling:** keep the read/write connection open across
  attaches, and close it (or `CHECKPOINT`) only before the engine needs to
  read. Alternatively, have the server and engines share one connection's
  data some other way (e.g. hand over a snapshot or an Arrow table).

### 5. Findings

Write the results up in this file: a table per workload (shmem, DuckDB
baseline, DuckDB after each fix), what explains the gaps, and a
recommendation. Can DuckDB reach shmem-like performance for each workload?
Which fixes are worth building properly, and which workloads still lose?

## Out of scope

Production-quality versions of the fixes, missing values, the engine
(beyond W8), and multiple data sets per project.
