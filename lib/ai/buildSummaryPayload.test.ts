import { describe, expect, it } from "vitest";
import { buildSummaryPayload } from "./buildSummaryPayload";
import type { DashboardPlan, TableProfile, WidgetResult } from "@/lib/schemas";

const profile: TableProfile = {
  tableName: "dataset",
  rowCount: 12,
  columns: [
    {
      name: "region",
      rawType: "string",
      semanticType: "categorical_low",
      stats: {
        count: 12,
        nullCount: 0,
        distinctCount: 3,
        // sampleValues are near-raw example cells — must NOT leak to the model.
        sampleValues: ["Norte", "Sur", "Centro"],
      },
    },
    {
      name: "precio",
      rawType: "number",
      semanticType: "measure_continuous",
      stats: {
        count: 12,
        nullCount: 0,
        distinctCount: 4,
        min: "19.5",
        max: "1290",
        mean: 411.1,
        sampleValues: [45.9, 289],
      },
    },
  ],
};

const plan: DashboardPlan = {
  title: "Ventas",
  widgets: [
    { id: "w1", title: "Ingresos por región", chartType: "bar", sql: "SELECT ..." },
    { id: "w2", title: "Detalle de ventas", chartType: "table", sql: "SELECT ..." },
  ],
};

const results: WidgetResult[] = [
  {
    widget: plan.widgets[0]!,
    status: "ok",
    sql: "SELECT ...",
    rows: [
      { region: "Sur", ingresos: 3247.6 },
      { region: "Norte", ingresos: 1719.2 },
    ],
  },
  {
    // A TABLE widget carries row-level data — its rows must be excluded.
    widget: plan.widgets[1]!,
    status: "ok",
    sql: "SELECT ...",
    rows: [
      { region: "Sur", precio: 289, cantidad: 1 },
      { region: "Norte", precio: 45.9, cantidad: 3 },
    ],
  },
];

describe("buildSummaryPayload", () => {
  it("includes dataset-level stats but never raw sampleValues", () => {
    const payload = buildSummaryPayload(profile, plan, results);
    const serialized = JSON.stringify(payload);
    expect(payload.dataset.rowCount).toBe(12);
    expect(payload.dataset.columns).toHaveLength(2);
    // Aggregate stats survive; example cell values do not.
    expect(serialized).not.toContain("sampleValues");
    expect(serialized).not.toContain("Centro"); // a sampleValue only
  });

  it("includes aggregated rows for chart widgets", () => {
    const payload = buildSummaryPayload(profile, plan, results);
    const barWidget = payload.widgets.find((w) => w.title === "Ingresos por región");
    expect(barWidget?.rows).toEqual([
      { region: "Sur", ingresos: 3247.6 },
      { region: "Norte", ingresos: 1719.2 },
    ]);
  });

  it("excludes row-level table-widget data (golden rule)", () => {
    const payload = buildSummaryPayload(profile, plan, results);
    const tableWidget = payload.widgets.find((w) => w.title === "Detalle de ventas");
    expect(tableWidget).toBeDefined();
    expect(tableWidget?.rows).toBeUndefined();
  });

  it("caps chart-widget rows to bound the payload", () => {
    const manyRows = Array.from({ length: 40 }, (_, i) => ({ k: `c${i}`, v: i }));
    const bigResults: WidgetResult[] = [
      { widget: plan.widgets[0]!, status: "ok", sql: "SELECT ...", rows: manyRows },
    ];
    const payload = buildSummaryPayload(profile, plan, bigResults);
    const widget = payload.widgets[0];
    expect(widget?.rows?.length).toBeLessThanOrEqual(12);
  });
});
