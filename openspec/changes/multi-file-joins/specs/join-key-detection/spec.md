# Join Key Detection Specification

## Purpose

Deterministically find candidate join keys between two profiled tables in code — by name compatibility and DuckDB-measured value-set overlap — before any model call. Candidates are the only new metadata that may later reach the model; nothing here invents or applies a join.

## Requirements

### Requirement: Name-Compatible Column Pairing

The system MUST pair columns across two `TableProfile`s by normalized name similarity (e.g. `id`, `customer_id`, `customerId`, `Customer ID` are compatible) restricted to columns whose `rawType`/`semanticType` are join-plausible (`id`, `categorical_low`, `categorical_high`), and MUST exclude free-text (`text`) and continuous-measure (`measure_continuous`) columns from consideration.

#### Scenario: Compatible id-shaped columns are paired

- GIVEN `orders.customer_id` (`semanticType: id`) and `customers.id` (`semanticType: id`)
- WHEN candidate-key detection runs on the `orders`/`customers` pair
- THEN `customer_id` and `id` are proposed as a name-compatible candidate pair

#### Scenario: Free-text columns are excluded

- GIVEN `orders.notes` (`semanticType: text`) and `customers.bio` (`semanticType: text`)
- WHEN candidate-key detection runs
- THEN neither column is proposed as a candidate key, regardless of any name similarity

### Requirement: DuckDB-Measured Value-Set Overlap

For each name-compatible pair, the system MUST measure value-set overlap by querying DuckDB for the ratio of distinct values in column A also present in column B (and vice versa), and MUST NOT estimate or guess this ratio without a query.

#### Scenario: High overlap qualifies as a candidate

- GIVEN a name-compatible pair where 95% of `orders.customer_id` distinct values exist in `customers.id`
- WHEN the overlap query runs in DuckDB
- THEN the pair is returned as a candidate key with its measured overlap ratio and cardinality direction (one-to-one or one-to-many)

#### Scenario: Low or zero overlap yields no candidate

- GIVEN a name-compatible pair where overlap is below the configured threshold (including zero overlap)
- WHEN the overlap query runs
- THEN the pair MUST NOT be returned as a candidate key
- AND no join is offered for that column pair

### Requirement: Bounded Overlap Computation for Large Tables

The system MUST bound overlap computation cost for large tables by sampling distinct values rather than scanning full tables beyond a configured row-count threshold, and MUST flag sampled results as estimates.

#### Scenario: Small tables use exact overlap

- GIVEN both tables in a pair are below the row-count threshold
- WHEN overlap is measured
- THEN the computation uses the full distinct value sets, and the result is not flagged as an estimate

#### Scenario: Large tables use sampled overlap

- GIVEN at least one table in a pair exceeds the row-count threshold
- WHEN overlap is measured
- THEN the computation uses a bounded sample of distinct values
- AND the resulting candidate metadata is flagged as an estimate

### Requirement: Candidates Are the Only Model-Bound Output

The system MUST expose candidate-key detection results as structured metadata (column names, types, overlap ratio, cardinality direction, estimate flag) only, and MUST NOT include any data row or raw distinct value in that output.

#### Scenario: Candidate metadata contains no row data

- GIVEN candidate-key detection has run on a table pair
- WHEN the resulting candidate list is inspected
- THEN it contains only column identifiers, overlap ratios, cardinality direction, and estimate flags
- AND no individual data value from either table appears in the output

### Requirement: No Candidates, No Forced Join

The system MUST proceed without error when a table pair yields zero candidate keys, leaving both tables usable independently.

#### Scenario: Unrelated tables produce zero candidates

- GIVEN two tables with no name-compatible, sufficiently-overlapping columns
- WHEN candidate-key detection runs
- THEN it returns an empty candidate list
- AND both tables remain fully usable in the per-table flow with no error surfaced to the user
