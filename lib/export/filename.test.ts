import { describe, expect, it } from "vitest";
import { exportFilename } from "./filename";

describe("exportFilename", () => {
  it("builds a dated dashboard filename for png", () => {
    const date = new Date("2026-07-02T15:30:00Z");
    expect(exportFilename("png", date)).toBe("analix-dashboard-2026-07-02.png");
  });

  it("builds a dated dashboard filename for pdf", () => {
    const date = new Date("2026-01-05T00:00:00Z");
    expect(exportFilename("pdf", date)).toBe("analix-dashboard-2026-01-05.pdf");
  });
});
