import { describe, expect, it } from "vitest";
import { chartComponentFor } from "./chartComponentFor";

describe("chartComponentFor", () => {
  it("maps kpi to the kpi component key (no Recharts)", () => {
    expect(chartComponentFor("kpi")).toBe("kpi");
  });

  it("maps line to the line chart component key", () => {
    expect(chartComponentFor("line")).toBe("line");
  });

  it("maps bar to the bar chart component key", () => {
    expect(chartComponentFor("bar")).toBe("bar");
  });

  it("maps donut to the donut (pie) chart component key", () => {
    expect(chartComponentFor("donut")).toBe("donut");
  });

  it("maps scatter to the scatter chart component key", () => {
    expect(chartComponentFor("scatter")).toBe("scatter");
  });

  it("maps histogram to the bar chart component key (pre-binned by SQL)", () => {
    expect(chartComponentFor("histogram")).toBe("histogram");
  });

  it("maps table to the plain table component key", () => {
    expect(chartComponentFor("table")).toBe("table");
  });
});
