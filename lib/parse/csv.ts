import Papa from "papaparse";

/**
 * Normalize arbitrary CSV text (delimiters, quoting, stray empty lines) into a
 * clean comma-delimited CSV that DuckDB's read_csv_auto handles predictably.
 */
export function normalizeCsv(rawText: string): string {
  const parsed = Papa.parse<string[]>(rawText.trim(), {
    skipEmptyLines: "greedy",
  });

  const hasData = Array.isArray(parsed.data) && parsed.data.length > 0;
  if (!hasData && parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }

  return Papa.unparse(parsed.data);
}
