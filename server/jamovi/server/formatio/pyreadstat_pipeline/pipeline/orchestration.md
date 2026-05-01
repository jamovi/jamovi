# SAV Import Pipeline - Architecture Overview

## High-Level Pipeline Structure

The two-pass importing system transforms raw SAV data into jamovi's instance model:

```
RAW SAV DATA
    ↓
[FIRST PASS: Profile & Build Plans]
    ↓
PROFILED COLUMNS + IMMUTABLE PLANS
    ↓
[SECOND PASS: Normalize & Write]
    ↓
JAMOVI MODEL (fully populated)
```

---

## Pass 1: Profiling & Plan Construction

**Function**: `first_pass(path, model, chunk_size)`

**Purpose**: Determine column metadata once, build immutable plans to drive pass-two.

**Stages**:

1. **Profile All Chunks** → `_profile_all_chunks()`
   - Reads all chunks sequentially
   - On first chunk: initialize columns, infer semantic kinds
   - On each chunk: promote storage, collect statistics
   - Output: Profiled `ImportRunState` with columns, row/chunk counts

2. **Finalize Columns into Plans** 
   - For each profiled column:
     - Freeze profiling state → `finalize_unfrozen_profile_states()`
     - Build immutable plan → `build_column_runtime_plan()`
     - Update mutable column → `apply_column_runtime_plan()`
   - Output: Same `ImportRunState` now with `column_plans` populated

3. **Set Row Count** on model

**Output**: `ImportRunState` with fully profiled columns and finalized plans

---

## Pass 2: Normalization & Writing

**Function**: `write_normalized_values_pass(path, model, chunk_size, finalized)`

**Purpose**: Use plans to transform raw chunks into jamovi's storage format.

**Stages**:

1. **Write Level Metadata** → `write_chunk_levels(columns, column_plans)`
   - Single operation before chunk iteration
   - Uses finalized plans to append levels to jamovi columns

2. **Process Each Chunk** → `_write_chunk()`
   - Normalize: `normalize_source_dataframe(chunk_df, column_plans)`
     - Cast to final Polars dtypes
     - Encode temporal/label data
     - Fill nulls per plan rules
   - Write: `write_chunk_values(writer, column_plans, normalized_chunk, offset)`
     - Stream normalized data to jamovi model
   - Accumulate row offsets

---

## Full Pipeline Entry Point

**Function**: `import_sav_to_jamovi_in_chunks(path, model, chunk_size)`

**Sequence**:

1. Invoke `first_pass()` → returns `ImportRunState` with plans
2. Invoke `write_normalized_values_pass()` with state from step 1
3. Report timing statistics

---

## Data Flow Abstraction

```
ImportRunState Dataclass
├─ columns: list[ImportColumn]          [mutable; state vehicle during pass-one]
├─ column_plans: list[ColumnFinalPlan]  [immutable; meta-instruction for pass-two]
├─ row_count: int                       [cardinality; passed to model]
└─ chunk_count: int                     [diagnostic info]
```

**Pass 1 Use**: Build plans from profiling; columns carry transient analysis state

**Pass 2 Use**: Plans drive all transformations; columns used for final append operations

---

## Key Architectural Properties

| Property | Value |
|----------|-------|
| **Isolation** | Pass-one state is ephemeral; pass-two is plan-driven |
| **Immutability** | Plans freeze column metadata at pass-one boundary; prevents drift |
| **Reusability** | Plans can be serialized/reused without re-profiling |
| **Chunk Streaming** | Each chunk normalized and written independently; O(1) memory relative to file size |
| **Error Semantics** | Stage failures logged with column names, chunk indices, offsets |

---

## Function Reference Map

| Function | Stage | Role |
|----------|-------|------|
| `first_pass()` | Pass 1 | Orchestrate profiling and plan construction |
| `_profile_all_chunks()` | Pass 1 | Iterate chunks, update column profiles |
| `_initialize_first_chunk()` | Pass 1 | Create columns and initialize semantic inference |
| `_profile_chunk()` | Pass 1 | Update storage/statistics for one chunk |
| `build_column_runtime_plan()` | Pass 1 | Freeze column metadata into plan |
| `apply_column_runtime_plan()` | Pass 1 | Reflect plan back onto mutable column |
| `write_normalized_values_pass()` | Pass 2 | Orchestrate normalization and writing |
| `_write_chunk()` | Pass 2 | Normalize one chunk and write to model |
| `normalize_source_dataframe()` | Pass 2 | Apply plan transformations (dtypes, encoding, null-fill) |
| `write_chunk_values()` | Pass 2 | Stream normalized chunk rows to jamovi |
| `write_chunk_levels()` | Pass 2 | Append level metadata from plans |
| `import_sav_to_jamovi_in_chunks()` | Entry | Invoke both passes and report timing |

---

## Why This Design?

1. **Single-Pass Profiling**: All row statistics collected before finalization; no backtracking
2. **Plan-as-Contract**: Pass-two functions depend only on plans, not column profiling state
3. **Stateless Normalization**: Same plan produces same output regardless of read order
4. **Observable Boundaries**: Clear split between construction (pass-one) and execution (pass-two)
