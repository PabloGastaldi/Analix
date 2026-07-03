import { describe, expect, it } from "vitest";
import { inferSemanticType, type SemanticTypeInput } from "./semanticType";

function make(
  overrides: Partial<SemanticTypeInput> & {
    count: number;
    distinctCount: number;
  },
): SemanticTypeInput {
  const { count, distinctCount, ...rest } = overrides;
  return {
    name: "col",
    rawType: "number",
    isInteger: true,
    stats: { count, distinctCount },
    ...rest,
  };
}

describe("inferSemanticType", () => {
  it("marks an almost-unique integer id column as id", () => {
    expect(
      inferSemanticType(
        make({ name: "user_id", count: 1000, distinctCount: 1000 }),
      ),
    ).toBe("id");
  });

  it("marks a near-unique integer as id even without an id-like name", () => {
    expect(
      inferSemanticType(make({ name: "n", count: 1000, distinctCount: 990 })),
    ).toBe("id");
  });

  it("treats a few distinct integers as a low-cardinality category (rating)", () => {
    expect(
      inferSemanticType(make({ name: "rating", count: 1000, distinctCount: 5 })),
    ).toBe("categorical_low");
  });

  it("treats a year stored as a small-cardinality integer as a category", () => {
    expect(
      inferSemanticType(make({ name: "anio", count: 1000, distinctCount: 8 })),
    ).toBe("categorical_low");
  });

  it("lets a measure-like name win over low cardinality (measure_discrete)", () => {
    expect(
      inferSemanticType(
        make({ name: "ventas", count: 1000, distinctCount: 6 }),
      ),
    ).toBe("measure_discrete");
  });

  it("treats a wide-range decimal as a continuous measure", () => {
    expect(
      inferSemanticType(
        make({
          name: "precio",
          isInteger: false,
          count: 1000,
          distinctCount: 800,
        }),
      ),
    ).toBe("measure_continuous");
  });

  it("treats many distinct integers as a discrete measure", () => {
    expect(
      inferSemanticType(
        make({ name: "cantidad", count: 1000, distinctCount: 120 }),
      ),
    ).toBe("measure_discrete");
  });

  it("maps a DuckDB date column to temporal", () => {
    expect(
      inferSemanticType(
        make({ name: "whatever", rawType: "date", count: 1000, distinctCount: 300 }),
      ),
    ).toBe("temporal");
  });

  it("maps a date-like string column name to temporal", () => {
    expect(
      inferSemanticType(
        make({
          name: "fecha_venta",
          rawType: "string",
          isInteger: false,
          count: 1000,
          distinctCount: 365,
        }),
      ),
    ).toBe("temporal");
  });

  it("treats a few distinct strings as a low-cardinality category", () => {
    expect(
      inferSemanticType(
        make({
          name: "region",
          rawType: "string",
          isInteger: false,
          count: 1000,
          distinctCount: 5,
        }),
      ),
    ).toBe("categorical_low");
  });

  it("treats many repeated strings as a high-cardinality category", () => {
    expect(
      inferSemanticType(
        make({
          name: "ciudad",
          rawType: "string",
          isInteger: false,
          count: 1000,
          distinctCount: 200,
        }),
      ),
    ).toBe("categorical_high");
  });

  it("treats mostly-unique strings as free text", () => {
    expect(
      inferSemanticType(
        make({
          name: "comentario",
          rawType: "string",
          isInteger: false,
          count: 1000,
          distinctCount: 950,
        }),
      ),
    ).toBe("text");
  });

  it("maps a boolean column to boolean", () => {
    expect(
      inferSemanticType(
        make({
          name: "activo",
          rawType: "boolean",
          isInteger: false,
          count: 1000,
          distinctCount: 2,
        }),
      ),
    ).toBe("boolean");
  });

  // Documents a known limitation: a postal code stored as an id-like integer is
  // classified as `id`. This is why the UI must let the user correct the type.
  it("misclassifies a postal code as id (user-correctable by design)", () => {
    expect(
      inferSemanticType(
        make({ name: "codigo_postal", count: 1000, distinctCount: 950 }),
      ),
    ).toBe("id");
  });
});
