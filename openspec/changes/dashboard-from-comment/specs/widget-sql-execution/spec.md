# Widget SQL Execution Specification

## Purpose

Execute each widget's SQL client-side against DuckDB-WASM, correcting failures with a bounded retry loop, and degrading gracefully per widget so one bad query never blanks the dashboard.

## Requirements

### Requirement: Per-Widget SQL Execution

The system MUST execute each widget's `sql` independently in DuckDB-WASM in the browser, and MUST NOT block rendering of other widgets while one is executing or retrying.

#### Scenario: Widget SQL executes successfully

- GIVEN a validated `DashboardPlan` with a widget whose `sql` is valid DuckDB SQL against the loaded table
- WHEN the executor runs that widget's SQL
- THEN the widget's status transitions to `ok` and its result rows are stored for rendering
- AND execution of this widget does not wait for or block other widgets

#### Scenario: Widgets execute independently

- GIVEN a plan with multiple widgets where widget A's SQL is invalid and widget B's SQL is valid
- WHEN the executor runs both
- THEN widget B renders successfully as soon as it resolves, independent of widget A's outcome

### Requirement: Bounded SQL Correction Loop

The system MUST retry a failing widget's SQL at most 2 times, feeding back the DuckDB error message and the table schema on each retry, before marking the widget unavailable.

#### Scenario: SQL error corrected on first retry

- GIVEN a widget's SQL execution fails with a DuckDB error
- WHEN the executor retries once, passing the error message and schema back for correction
- THEN if the corrected SQL succeeds, the widget status transitions to `ok`
- AND no further retries are attempted

#### Scenario: SQL error corrected on second retry

- GIVEN a widget's SQL fails on the initial attempt and the first retry
- WHEN the executor performs a second retry (the final allowed attempt)
- THEN if this attempt succeeds, the widget status transitions to `ok`
- AND the executor has made no more than 3 total execution attempts (1 initial + 2 retries) for that widget

#### Scenario: Widget marked unavailable after exhausting retries

- GIVEN a widget's SQL fails on the initial attempt and both retries
- WHEN the executor has exhausted the 2-retry budget
- THEN the widget status transitions to `unavailable`
- AND the executor MUST NOT throw past the widget boundary
- AND all other widgets in the plan continue to render normally

### Requirement: Widget Retry Budget Independence

The client-side SQL correction budget (≤2 retries per widget) MUST be tracked and enforced independently of the server-side plan re-ask budget (≤1 re-ask), so total per-dashboard cost stays bounded and predictable.

#### Scenario: Combined retry cost is bounded

- GIVEN a dashboard with N widgets, each potentially retrying up to 2 times
- WHEN the full comment-to-dashboard flow runs
- THEN the total plan-generation calls are bounded by 2 (1 initial + 1 re-ask), regardless of N
- AND the total SQL execution attempts are bounded by 3×N (1 initial + 2 retries per widget), independent of the plan retry outcome
