import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import PDFKit from "pdfkit";
import { formatUzs } from "../../lib/money.js";

type DashboardMetrics = Awaited<ReturnType<typeof import("./service.js").computeDashboardMetrics>>;

const ROW_LABELS: Array<[keyof DashboardMetrics, string]> = [
  ["grossSales", "Yalpi savdo"],
  ["discountTotal", "Chegirmalar"],
  ["returnsTotal", "Qaytarishlar"],
  ["netSales", "Sof savdo"],
  ["cogs", "Sotilgan mahsulot tannarxi (COGS)"],
  ["grossProfit", "Yalpi foyda"],
  ["operatingExpenses", "Operatsion xarajatlar"],
  ["netOperatingProfit", "Taxminiy operatsion sof foyda"],
  ["salesCount", "Savdolar soni"],
  ["averageOrderValue", "O'rtacha chek"],
  ["unitsSold", "Sotilgan birliklar"],
  ["cashInflow", "Naqd kirim"],
  ["cashOutflow", "Naqd chiqim"],
];

export function metricsToRows(metrics: DashboardMetrics): Array<{ metric: string; value: string | number }> {
  return ROW_LABELS.map(([key, label]) => ({
    metric: label,
    value: typeof metrics[key] === "number" && key !== "salesCount" && key !== "unitsSold"
      ? formatUzs(metrics[key] as number)
      : (metrics[key] as number),
  }));
}

export function exportMetricsToCsv(metrics: DashboardMetrics): string {
  return stringify(metricsToRows(metrics), { header: true });
}

export async function exportMetricsToXlsx(metrics: DashboardMetrics): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");
  sheet.columns = [{ header: "Ko'rsatkich", key: "metric", width: 40 }, { header: "Qiymat", key: "value", width: 20 }];
  sheet.addRows(metricsToRows(metrics));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function exportMetricsToPdf(storeName: string, periodLabel: string, metrics: DashboardMetrics): NodeJS.ReadableStream {
  const doc = new PDFKit({ margin: 40 });
  doc.fontSize(16).text(storeName, { align: "center" });
  doc.fontSize(12).text(`Moliyaviy hisobot — ${periodLabel}`, { align: "center" });
  doc.moveDown(1);

  for (const row of metricsToRows(metrics)) {
    doc.fontSize(10).text(`${row.metric}: ${row.value}`);
  }

  doc.moveDown(1);
  doc.fontSize(8).text(
    "Eslatma: Yalpi foyda, operatsion foyda va COGS ko'rsatkichlari operatsion baholashlar hisoblanadi (o'rtacha vaznli tannarx usuli). " +
    "Rasmiy buxgalteriya va soliq hisobotlari uchun ushbu raqamlarni malakali buxgalter tekshirishi tavsiya etiladi.",
    { align: "left" },
  );

  doc.end();
  return doc as unknown as NodeJS.ReadableStream;
}
