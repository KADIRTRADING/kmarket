import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import type { ImportRow } from "./service.js";

const HEADER_MAP: Record<string, keyof ImportRow> = {
  name: "name",
  nomi: "name",
  sku: "sku",
  barcode: "barcode",
  shtrixkod: "barcode",
  category: "categoryName",
  categoryname: "categoryName",
  kategoriya: "categoryName",
  brand: "brandName",
  brendi: "brandName",
  unit: "unit",
  birlik: "unit",
  purchasecost: "purchaseCost",
  tannarx: "purchaseCost",
  sellingprice: "sellingPrice",
  sotishnarxi: "sellingPrice",
  minstock: "minStock",
  minqoldiq: "minStock",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function rowsFromRecords(records: Record<string, string>[]): ImportRow[] {
  return records.map((record) => {
    const row: Partial<ImportRow> = {};
    for (const [key, value] of Object.entries(record)) {
      const field = HEADER_MAP[normalizeHeader(key)];
      if (!field) continue;
      if (field === "purchaseCost" || field === "sellingPrice" || field === "minStock") {
        const num = Number(String(value).replace(/[^0-9.-]/g, ""));
        (row as Record<string, unknown>)[field] = Number.isFinite(num) ? Math.round(num) : undefined;
      } else {
        (row as Record<string, unknown>)[field] = value?.trim();
      }
    }
    return row as ImportRow;
  });
}

export function parseCsvImport(buffer: Buffer): ImportRow[] {
  const records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return rowsFromRecords(records);
}

export async function parseXlsxImport(buffer: Buffer): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer));
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => String(h ?? ""));

  const records: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (header) record[header] = String(cell.value ?? "");
    });
    if (Object.values(record).some((v) => v !== "")) records.push(record);
  });

  return rowsFromRecords(records);
}
