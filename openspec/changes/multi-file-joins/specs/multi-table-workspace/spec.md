# Multi-Table Workspace Specification

## Purpose

Let a user ingest multiple files into distinct, named, profiled DuckDB tables in one session, switch between them, and run the existing single-table dashboard/comment/summary/chat flow unchanged against whichever table is active. No join logic lives here — per-table use is the default, safe experience.

## Requirements

### Requirement: Multi-File Ingest Into Distinct Tables

The system MUST ingest each uploaded file (CSV/Excel) into its own DuckDB table with a sanitized, collision-free table name, and MUST NOT overwrite or drop a previously ingested table when a new file is added.

#### Scenario: First file ingested

- GIVEN an empty workspace
- WHEN the user uploads `orders.csv`
- THEN a DuckDB table is created with a name derived from `orders.csv`
- AND a `TableProfile` and preview rows are produced and stored for that table

#### Scenario: Second file does not lose the first

- GIVEN a workspace with one ingested table `orders`
- WHEN the user uploads `customers.csv`
- THEN a second DuckDB table and `TableProfile` are created
- AND the `orders` table, its profile, and preview rows remain queryable and unchanged

#### Scenario: Colliding table names are deduped

- GIVEN a workspace already holds a table derived from `data.csv`
- WHEN the user uploads another file that sanitizes to the same identifier
- THEN the system MUST suffix the new table name to avoid a collision
- AND both tables remain independently selectable

#### Scenario: One file only

- GIVEN a user uploads exactly one file
- THEN the workspace holds one table and behaves identically to the pre-multi-file single-table flow

### Requirement: Table Switcher Drives the Active Table

The system MUST provide a UI listing all ingested tables and MUST let the user select one as the **active table**. The existing plan/comment/summary/chat flow MUST run against the active table's profile only.

#### Scenario: Switching tables changes the flow's target

- GIVEN two ingested tables, `orders` (active) and `customers`
- WHEN the user selects `customers` as active
- THEN subsequent comment submissions, plan generation, summary generation, and chat questions target `customers`' `TableProfile`
- AND `orders` and its prior results remain stored and unaffected

#### Scenario: Table inspection

- GIVEN one or more ingested tables
- WHEN the user opens the table switcher
- THEN each table's name, row count, and column count are visible
- AND the user can inspect any table's profile without making it active

### Requirement: Per-Table Type Correction Scope

The system MUST scope column-type corrections to the table being edited and MUST NOT apply a correction made on one table's profile to any other table.

#### Scenario: Correcting a column type on one table

- GIVEN two tables each with a column named `id`
- WHEN the user changes the semantic type of `orders.id` via the type-correction dropdown
- THEN only `orders`' `TableProfile` reflects the change
- AND `customers.id`'s semantic type is unaffected

### Requirement: Reset and Per-Table Removal

The system MUST let the user clear the entire workspace (all tables) and MUST let the user drop a single table without affecting the others.

#### Scenario: Removing one table

- GIVEN three ingested tables
- WHEN the user removes one of them
- THEN that table's DuckDB table, profile, and preview rows are deleted
- AND the remaining two tables and their state are unaffected
- AND if the removed table was active, the workspace has no active table until the user selects one

#### Scenario: Full reset

- GIVEN a workspace with any number of tables
- WHEN the user triggers a full reset
- THEN all DuckDB tables, profiles, preview rows, and any active-table selection are cleared
- AND the workspace returns to its empty starting state

### Requirement: Existing Single-Table Behavior Preserved

The system MUST preserve all Phase 0-5 behavior (ingest, profiling, plan/comment, summary, chat, SQL correction loop, golden rule) for the active table with no special-casing.

#### Scenario: Plan generation against the active table

- GIVEN an active table with a profile
- WHEN the user submits a comment and generates a plan
- THEN the request to `/api/plan` sends only that table's `TableProfile` and the comment — never rows, and never another table's profile
