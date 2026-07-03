# Widget Rendering Specification

## Purpose

Render each widget's DuckDB result as a chart or KPI card via Recharts, driven by `chartType` and `encoding`, including a defined degraded state for empty or degenerate results.

## Requirements

### Requirement: ChartType-Driven Rendering

The system MUST render each widget using the Recharts component matching its `chartType` (`kpi`, `line`, `bar`, `donut`, `scatter`, `histogram`, `table`), mapping SQL result columns to chart axes/series via `encoding` (`x`, `y`, `series`, `valueFormat`).

#### Scenario: Widget renders with populated result

- GIVEN a widget with status `ok`, `chartType: "bar"`, and a non-empty result set
- WHEN `WidgetGrid` renders the widget
- THEN it renders a bar chart using `encoding.x` and `encoding.y` to map result columns to axes
- AND KPI values use `tabular-nums` and design-system chart tokens (`--chart-1..5`)

#### Scenario: Unknown or unsupported chartType

- GIVEN a widget's `chartType` is a value outside the seven supported types (should not occur given schema validation, but defensively handled)
- WHEN `WidgetGrid` attempts to render it
- THEN the widget renders in the same degraded/unavailable state defined below, not a crash

### Requirement: Degraded Rendering State for Empty or Degenerate Results

The system MUST render a defined "empty/insufficient data" state — instead of breaking, crashing, or rendering a misleading empty chart — whenever a widget's result is empty, single-valued, or null-heavy.

#### Scenario: Zero-row result

- GIVEN a widget's SQL executes successfully (status `ok`) but returns zero rows
- WHEN `WidgetGrid` renders that widget
- THEN it displays the widget's title/card shell with an inline "no data" message
- AND no chart axes, empty grid lines, or broken chart primitives are rendered

#### Scenario: Single-value result on a chart-type widget

- GIVEN a `line`, `bar`, `donut`, `scatter`, or `histogram` widget's result contains exactly one data point
- WHEN `WidgetGrid` renders that widget
- THEN it renders that value as a static single-point/single-bar representation or falls back to the "insufficient data for a chart" message
- AND it does not render a broken or empty-axis chart

#### Scenario: Single-value result on a KPI widget

- GIVEN a `kpi` widget's result contains a single row/value
- WHEN `WidgetGrid` renders that widget
- THEN it renders the value formatted per `encoding.valueFormat`
- AND if the value is `null` or missing, it renders `"—"` instead of blank space or `NaN`

#### Scenario: Null-heavy result

- GIVEN a widget's result rows contain mostly `null` values in the columns mapped by `encoding`
- WHEN `WidgetGrid` renders that widget
- THEN null data points are omitted from chart series (not plotted as zero or a broken point)
- AND if ALL mapped values are null, the widget falls back to the "no data" empty state

#### Scenario: Widget marked unavailable by the SQL executor

- GIVEN a widget's status is `unavailable` (per widget-sql-execution capability, after exhausting retries)
- WHEN `WidgetGrid` renders that widget
- THEN it renders a quiet degraded card (title + "unavailable" indicator), not an error explosion, stack trace, or blank tile
- AND the rest of the dashboard grid renders normally around it

### Requirement: Grid-Level Fault Isolation

A single widget's rendering failure MUST NOT prevent the rest of the `WidgetGrid` from rendering.

#### Scenario: One widget throws during render

- GIVEN one widget's component throws during render (e.g. malformed encoding edge case not caught upstream)
- WHEN `WidgetGrid` renders the full plan
- THEN that widget is isolated to its own degraded/error tile
- AND all other widgets in the grid render unaffected
