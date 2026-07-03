import { describe, expect, it } from "vitest";
import {
  addTable,
  applyPlan,
  applyWidgetResult,
  deriveStatus,
  removeTable,
  setActiveTable,
  updateActiveColumnType,
  type DataTable,
  type TableRegistryState,
} from "./store.reducers";
import type { DashboardPlan, TableProfile, Widget, WidgetResult } from "@/lib/schemas";

function widget(id: string): Widget {
  return {
    id,
    title: `Widget ${id}`,
    chartType: "kpi",
    sql: `SELECT 1 AS value FROM "dataset"`,
  };
}

function plan(widgetIds: string[]): DashboardPlan {
  return {
    title: "Test plan",
    widgets: widgetIds.map(widget),
  };
}

describe("applyPlan", () => {
  it("sets planStatus to 'executing' and creates pending placeholders for each widget", () => {
    const initial = {
      plan: null,
      widgetResults: [] as WidgetResult[],
      planStatus: "planning" as const,
      planError: "previous error" as string | null,
    };

    const next = applyPlan(initial, plan(["w1", "w2"]));

    expect(next.planStatus).toBe("executing");
    expect(next.plan?.widgets).toHaveLength(2);
    expect(next.planError).toBeNull();
    expect(next.widgetResults).toHaveLength(2);
    expect(next.widgetResults.every((r) => r.status === "pending")).toBe(true);
  });

  it("does not mutate the input state object", () => {
    const initial = {
      plan: null,
      widgetResults: [] as WidgetResult[],
      planStatus: "planning" as const,
      planError: null as string | null,
    };

    const next = applyPlan(initial, plan(["w1"]));

    expect(next).not.toBe(initial);
    expect(initial.plan).toBeNull();
  });
});

describe("applyWidgetResult", () => {
  it("fills in one widget's result incrementally, leaving others pending", () => {
    const afterPlan = applyPlan(
      {
        plan: null,
        widgetResults: [],
        planStatus: "planning" as const,
        planError: null as string | null,
      },
      plan(["w1", "w2"]),
    );

    const result: WidgetResult = {
      widget: widget("w1"),
      status: "ok",
      rows: [{ value: 42 }],
      sql: `SELECT 1 AS value FROM "dataset"`,
    };

    const next = applyWidgetResult(afterPlan, result);

    const w1 = next.widgetResults.find((r) => r.widget.id === "w1");
    const w2 = next.widgetResults.find((r) => r.widget.id === "w2");

    expect(w1?.status).toBe("ok");
    expect(w2?.status).toBe("pending");
  });

  it("sets planStatus to 'ready' once every widget has settled", () => {
    const afterPlan = applyPlan(
      {
        plan: null,
        widgetResults: [],
        planStatus: "planning" as const,
        planError: null as string | null,
      },
      plan(["w1", "w2"]),
    );

    const afterFirst = applyWidgetResult(afterPlan, {
      widget: widget("w1"),
      status: "empty",
    });
    expect(afterFirst.planStatus).toBe("executing");

    const afterSecond = applyWidgetResult(afterFirst, {
      widget: widget("w2"),
      status: "unavailable",
      reason: "boom",
    });

    expect(afterSecond.planStatus).toBe("ready");
    expect(afterSecond.widgetResults.every((r) => r.status !== "pending")).toBe(true);
  });

  it("does not mutate the input state object", () => {
    const afterPlan = applyPlan(
      {
        plan: null,
        widgetResults: [],
        planStatus: "planning" as const,
        planError: null as string | null,
      },
      plan(["w1"]),
    );

    const result: WidgetResult = { widget: widget("w1"), status: "empty" };
    const next = applyWidgetResult(afterPlan, result);

    expect(next).not.toBe(afterPlan);
    expect(afterPlan.widgetResults.every((r) => r.status === "pending")).toBe(true);
  });
});

describe("deriveStatus", () => {
  it("returns 'executing' when at least one widget is still pending", () => {
    const results = [
      { widget: widget("w1"), status: "pending" as const },
      { widget: widget("w2"), status: "ok" as const, rows: [], sql: "" },
    ];

    expect(deriveStatus(results)).toBe("executing");
  });

  it("returns 'ready' when all widgets have settled (ok/empty/unavailable)", () => {
    const results: WidgetResult[] = [
      { widget: widget("w1"), status: "ok", rows: [{ a: 1 }], sql: "SELECT 1" },
      { widget: widget("w2"), status: "empty" },
      { widget: widget("w3"), status: "unavailable", reason: "boom" },
    ];

    expect(deriveStatus(results)).toBe("ready");
  });

  it("returns 'ready' for an empty widget list", () => {
    expect(deriveStatus([])).toBe("ready");
  });
});

function profile(tableName: string): TableProfile {
  return {
    tableName,
    rowCount: 10,
    columns: [
      {
        name: "id",
        rawType: "number",
        semanticType: "id",
        stats: { count: 10, nullCount: 0, distinctCount: 10, sampleValues: [1, 2, 3] },
      },
    ],
  };
}

function dataTable(tableName: string, kind: DataTable["kind"] = "file"): DataTable {
  return {
    tableName,
    fileName: `${tableName}.csv`,
    profile: profile(tableName),
    previewRows: [{ id: 1 }],
    kind,
  };
}

function registryState(overrides: Partial<TableRegistryState> = {}): TableRegistryState {
  return {
    tables: [],
    activeTableName: null,
    comment: "prior comment",
    plan: null,
    widgetResults: [],
    planStatus: "idle",
    planError: null,
    summary: null,
    summaryStatus: "idle",
    summaryError: null,
    chatMessages: [],
    ...overrides,
  };
}

describe("addTable", () => {
  it("appends without disturbing existing entries", () => {
    const orders = dataTable("orders");
    const initial = registryState({ tables: [orders], activeTableName: "orders" });

    const customers = dataTable("customers");
    const next = addTable(initial, customers);

    expect(next.tables).toHaveLength(2);
    expect(next.tables[0]).toEqual(orders);
    expect(next.tables[1]).toEqual(customers);
  });

  it("sets activeTableName only when previously null", () => {
    const initial = registryState({ tables: [], activeTableName: null });
    const orders = dataTable("orders");

    const next = addTable(initial, orders);
    expect(next.activeTableName).toBe("orders");

    const customers = dataTable("customers");
    const afterSecond = addTable(next, customers);
    expect(afterSecond.activeTableName).toBe("orders");
  });

  it("does not mutate the input state object", () => {
    const initial = registryState();
    const next = addTable(initial, dataTable("orders"));
    expect(next).not.toBe(initial);
    expect(initial.tables).toHaveLength(0);
  });
});

describe("setActiveTable", () => {
  it("switches activeTableName and clears derived plan/summary/chat state", () => {
    const orders = dataTable("orders");
    const customers = dataTable("customers");
    const initial = registryState({
      tables: [orders, customers],
      activeTableName: "orders",
      comment: "revenue by month",
      plan: { title: "t", widgets: [] },
      widgetResults: [{ widget: { id: "w1", title: "W", chartType: "kpi", sql: "SELECT 1" }, status: "ok", rows: [], sql: "SELECT 1" }],
      summary: { insights: [] },
      summaryStatus: "ready",
      summaryError: null,
      chatMessages: [{ role: "user", text: "hi" }],
    });

    const next = setActiveTable(initial, "customers");

    expect(next.activeTableName).toBe("customers");
    expect(next.plan).toBeNull();
    expect(next.widgetResults).toEqual([]);
    expect(next.summary).toBeNull();
    expect(next.summaryStatus).toBe("idle");
    expect(next.chatMessages).toEqual([]);
    expect(next.comment).toBe("");
  });

  it("preserves the tables array", () => {
    const orders = dataTable("orders");
    const customers = dataTable("customers");
    const initial = registryState({ tables: [orders, customers], activeTableName: "orders" });

    const next = setActiveTable(initial, "customers");

    expect(next.tables).toEqual([orders, customers]);
  });
});

describe("updateActiveColumnType", () => {
  it("mutates only the active table's column", () => {
    const orders = dataTable("orders");
    const customers = dataTable("customers");
    const initial = registryState({ tables: [orders, customers], activeTableName: "orders" });

    const next = updateActiveColumnType(initial, "id", "categorical_low");

    const nextOrders = next.tables.find((t) => t.tableName === "orders");
    const nextCustomers = next.tables.find((t) => t.tableName === "customers");

    expect(nextOrders?.profile.columns[0].semanticType).toBe("categorical_low");
    expect(nextCustomers?.profile.columns[0].semanticType).toBe("id");
  });

  it("is a no-op when there is no active table", () => {
    const initial = registryState({ tables: [dataTable("orders")], activeTableName: null });
    const next = updateActiveColumnType(initial, "id", "categorical_low");
    expect(next.tables).toEqual(initial.tables);
  });
});

describe("removeTable", () => {
  it("drops the entry and re-activates the first remaining table", () => {
    const orders = dataTable("orders");
    const customers = dataTable("customers");
    const initial = registryState({ tables: [orders, customers], activeTableName: "orders" });

    const next = removeTable(initial, "orders");

    expect(next.tables).toEqual([customers]);
    expect(next.activeTableName).toBe("customers");
  });

  it("sets activeTableName to null when no tables remain", () => {
    const orders = dataTable("orders");
    const initial = registryState({ tables: [orders], activeTableName: "orders" });

    const next = removeTable(initial, "orders");

    expect(next.tables).toEqual([]);
    expect(next.activeTableName).toBeNull();
  });

  it("does not change activeTableName when removing an inactive table", () => {
    const orders = dataTable("orders");
    const customers = dataTable("customers");
    const initial = registryState({ tables: [orders, customers], activeTableName: "orders" });

    const next = removeTable(initial, "customers");

    expect(next.tables).toEqual([orders]);
    expect(next.activeTableName).toBe("orders");
  });

  it("also drops any join-view entry that depended on the removed table", () => {
    const orders = dataTable("orders");
    const customers = dataTable("customers");
    const joined = { ...dataTable("join_orders_customers", "join"), dependsOn: ["orders", "customers"] };
    const initial = registryState({
      tables: [orders, customers, joined],
      activeTableName: "join_orders_customers",
    });

    const next = removeTable(initial, "orders");

    expect(next.tables.map((t) => t.tableName)).toEqual(["customers"]);
    expect(next.activeTableName).toBe("customers");
  });
});
