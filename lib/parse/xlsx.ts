import * as XLSX from "xlsx";

export interface XlsxResult {
  csv: string;
  sheetName: string;
}

/** Read an XLSX/XLS buffer and convert its first sheet to CSV text. */
export function xlsxToCsv(data: ArrayBuffer): XlsxResult {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo Excel no tiene hojas.");
  }
  const sheet = workbook.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet);
  return { csv, sheetName };
}
