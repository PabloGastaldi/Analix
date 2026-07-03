import { normalizeCsv } from "./csv";
import { xlsxToCsv } from "./xlsx";

export interface ParsedFile {
  csv: string;
  sheetName?: string;
}

/** Turn an uploaded CSV or Excel file into normalized CSV text. */
export async function fileToCsv(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || file.type === "text/csv") {
    const text = await file.text();
    return { csv: normalizeCsv(text) };
  }

  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return xlsxToCsv(buffer);
  }

  throw new Error(
    `Formato no soportado: .${ext ?? "?"}. Subí un archivo CSV o Excel.`,
  );
}
