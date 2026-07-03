# Joined View Integration Specification

## Purpose

Turn a confirmed join into a DuckDB `VIEW`, profile it into a normal `TableProfile`, and register it as a selectable table so the existing plan/summary/chat flow runs over it with zero special-casing — while warning on fan-out and never breaking the dashboard when a join is absent or fails.

## Requirements

### Requirement: Confirmed Join Builds a DuckDB View

The system MUST create a DuckDB `VIEW` joining the two tables on the user-confirmed key columns and join type only after explicit confirmation, and MUST NOT create any view before confirmation.

#### Scenario: View created on confirmation

- GIVEN the user confirmed a join between `orders.customer_id` and `customers.id` with an inner join
- WHEN the confirmation is submitted
- THEN a DuckDB `VIEW` is created joining both tables on those keys with that join type

#### Scenario: No view before confirmation

- GIVEN an inferred join proposal has been displayed but not yet confirmed
- WHEN the user has not acted on it
- THEN no DuckDB `VIEW` exists for that pair

### Requirement: Joined View Is a Normal Profiled Table

The system MUST profile the joined view with the same `profileTable` used for ingested tables, producing a standard `TableProfile`, and MUST register it as a selectable table indistinguishable from any other table to the plan/summary/chat flow.

#### Scenario: Joined view usable like any table

- GIVEN a joined view has been created and profiled
- WHEN the user selects it as the active table and submits a comment
- THEN plan generation, summary generation, and chat run against its `TableProfile` exactly as they would for an ingested table, with no join-specific branching visible to those flows

#### Scenario: Golden rule holds over joined data

- GIVEN a joined view is active
- WHEN a plan or chat request is sent to the model
- THEN only the joined view's `TableProfile` (schema + stats) is sent — never underlying rows from either source table

### Requirement: One-to-Many Fan-Out Warning

The system MUST detect when a confirmed join's cardinality direction is one-to-many and MUST surface a warning to the user before or immediately after the view is built.

#### Scenario: Fan-out join warns the user

- GIVEN the confirmed join's candidate metadata indicates one-to-many cardinality
- WHEN the view is built
- THEN the user is shown a warning that totals/aggregates on the joined view may be inflated by row duplication

#### Scenario: One-to-one join has no fan-out warning

- GIVEN the confirmed join's candidate metadata indicates one-to-one cardinality
- WHEN the view is built
- THEN no fan-out warning is shown

### Requirement: Graceful Degradation to Per-Table Experience

The system MUST fall back to the per-table experience — never an error state or a broken dashboard — whenever no reliable join exists: zero candidates, model low-confidence/invalid output, or explicit user rejection.

#### Scenario: No candidates found

- GIVEN candidate-key detection returns zero candidates for a table pair
- WHEN the user views those two tables
- THEN no join is offered, and each table's dashboard/summary/chat flow works independently

#### Scenario: Inference fails or is rejected

- GIVEN join inference returns no actionable proposal, or the user rejects an inferred proposal
- WHEN the user continues working
- THEN the workspace stays in the per-table state with no error banner blocking either table

#### Scenario: View creation fails

- GIVEN a confirmed join proposal but the `CREATE VIEW` statement fails in DuckDB
- WHEN the failure occurs
- THEN the system MUST NOT crash the dashboard
- AND the system surfaces a clear error and leaves both source tables usable independently
