import type {
  DashboardPlan,
  DashboardSummary,
  PlanStatus,
  SemanticType,
  TableProfile,
  WidgetResult,
} from "@/lib/schemas";
import type { Row } from "@/lib/duckdb/query";

/**
 * Pure plan/result reducers extracted from `useDataStore` (design §5, Work
 * Unit 8). No React, no Zustand, no DuckDB, no network — the store just
 * wires these onto `set()` so state transitions are unit-tested directly.
 */

/** Slice of store state these reducers read/write. */
export interface PlanReducerState {
  plan: DashboardPlan | null;
  widgetResults: WidgetResult[];
  planStatus: PlanStatus;
  planError: string | null;
}

/**
 * Plan received from the route (design §5 step 3): store the plan, move to
 * `"executing"`, and seed one `pending` placeholder per widget so the grid
 * can render a loading tile immediately, before any widget has resolved.
 */
export function applyPlan(
  state: PlanReducerState,
  plan: DashboardPlan,
): PlanReducerState {
  return {
    ...state,
    plan,
    planStatus: "executing",
    planError: null,
    widgetResults: plan.widgets.map((widget) => ({ widget, status: "pending" })),
  };
}

/**
 * Applies one widget's settled result incrementally (design §5 step 4): the
 * grid fills in per-widget, not atomically. Matches by `widget.id` so a
 * result can replace its own `pending` placeholder regardless of resolution
 * order. Re-derives `planStatus` via `deriveStatus` once applied.
 */
export function applyWidgetResult(
  state: PlanReducerState,
  result: WidgetResult,
): PlanReducerState {
  const widgetResults = state.widgetResults.map((existing) =>
    existing.widget.id === result.widget.id ? result : existing,
  );

  return {
    ...state,
    widgetResults,
    planStatus: deriveStatus(widgetResults),
  };
}

/**
 * `"ready"` once every widget has settled (not `pending`); `"executing"`
 * while at least one is still outstanding. An empty list is vacuously
 * settled -> `"ready"`.
 */
export function deriveStatus(widgetResults: WidgetResult[]): PlanStatus {
  return widgetResults.some((result) => result.status === "pending")
    ? "executing"
    : "ready";
}

/**
 * Table registry (design §1, Slice 1). One entry per ingested file or
 * confirmed join view. `kind: "join"` entries carry `dependsOn` so
 * `removeTable` can cascade-drop them when a base table is removed.
 */
export interface DataTable {
  tableName: string;
  fileName: string;
  profile: TableProfile;
  previewRows: Row[];
  kind: "file" | "join";
  /** Base table names this entry (a join view) was built from. */
  dependsOn?: string[];
  /**
   * Plain-language fan-out warning (design §6, Slice 2), set when a
   * `kind: "join"` entry's confirmed cardinality is one-to-many/many-to-one.
   * Rendered in `JoinPanel` and wherever the joined table is selected/active.
   */
  fanOutWarning?: string;
}

/** One chat turn (§Fase 4). The assistant answer is an executed widget + its SQL. */
export type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; result: WidgetResult; sql: string }
  | { role: "assistant-error"; text: string };

/**
 * Slice of store state the table-registry reducers read/write. Includes the
 * derived plan/summary/chat/comment slices because `setActiveTable` and
 * `removeTable` (when the active table changes) must clear them.
 */
export interface TableRegistryState {
  tables: DataTable[];
  activeTableName: string | null;
  comment: string;
  plan: DashboardPlan | null;
  widgetResults: WidgetResult[];
  planStatus: PlanStatus;
  planError: string | null;
  summary: DashboardSummary | null;
  summaryStatus: "idle" | "loading" | "ready" | "error";
  summaryError: string | null;
  chatMessages: ChatMessage[];
}

/** Derived plan/summary/chat slices cleared whenever the active table changes. */
function clearedDerivedState<T extends TableRegistryState>(state: T): T {
  return {
    ...state,
    comment: "",
    plan: null,
    widgetResults: [],
    planStatus: "idle",
    planError: null,
    summary: null,
    summaryStatus: "idle",
    summaryError: null,
    chatMessages: [],
  };
}

/**
 * Append a newly ingested table (design §1). Never disturbs existing
 * entries. Sets `activeTableName` only when nothing was active yet — the
 * second and later ingests never steal focus from the table the user is
 * already working with.
 */
export function addTable<T extends TableRegistryState>(state: T, table: DataTable): T {
  return {
    ...state,
    tables: [...state.tables, table],
    activeTableName: state.activeTableName ?? table.tableName,
  };
}

/**
 * Switch the active table and clear the derived plan/summary/chat/comment
 * state (design §1) — those are outputs of the previously active profile.
 * `tables` themselves are preserved untouched.
 */
export function setActiveTable<T extends TableRegistryState>(
  state: T,
  tableName: string,
): T {
  return {
    ...clearedDerivedState(state),
    activeTableName: tableName,
  };
}

/**
 * Scope a column-type correction to the active table only (design §1).
 * No-op when there is no active table.
 */
export function updateActiveColumnType<T extends TableRegistryState>(
  state: T,
  columnName: string,
  type: SemanticType,
): T {
  const { activeTableName } = state;
  if (!activeTableName) return state;

  return {
    ...state,
    tables: state.tables.map((table) => {
      if (table.tableName !== activeTableName) return table;
      return {
        ...table,
        profile: {
          ...table.profile,
          columns: table.profile.columns.map((column) =>
            column.name === columnName ? { ...column, semanticType: type } : column,
          ),
        },
      };
    }),
  };
}

/**
 * Drop a table entry (design §1). If it was a base table that a join view
 * depends on, the dependent join view is dropped too. If the removed table
 * (or a cascaded join view) was active, the first remaining table becomes
 * active, or `null` if none remain.
 */
export function removeTable<T extends TableRegistryState>(
  state: T,
  tableName: string,
): T {
  const remaining = state.tables.filter(
    (table) =>
      table.tableName !== tableName && !(table.dependsOn?.includes(tableName) ?? false),
  );

  const activeRemoved = !remaining.some((table) => table.tableName === state.activeTableName);
  const nextActiveTableName = activeRemoved
    ? (remaining[0]?.tableName ?? null)
    : state.activeTableName;

  const base: T = { ...state, tables: remaining, activeTableName: nextActiveTableName };
  return activeRemoved ? clearedDerivedState({ ...base, activeTableName: nextActiveTableName }) : base;
}
