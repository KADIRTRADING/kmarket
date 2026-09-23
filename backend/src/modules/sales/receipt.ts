import PDFKit from "pdfkit";
import { formatUzs } from "../../lib/money.js";

interface ReceiptSale {
  sale_number: number;
  created_at: string;
  total: number;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  items: Array<{ product_name: string; sku: string; quantity: string; unit_price: number; line_total: number }>;
  payments: Array<{ method: string; amount: number }>;
}

/**
 * Generates a PDF sales receipt. Explicitly titled "Sotuv kvitansiyasi / Товарный
 * чек" — a store sales receipt — and includes a footer disclaimer that this is NOT a
 * certified fiscal document (R7.6, design.md §9). No integration with Uzbekistan's
 * certified fiscal cash register / OFD service exists in this codebase.
 */
export function generateReceiptPdf(storeName: string, sale: ReceiptSale, language: "uz" | "ru" = "uz"): NodeJS.ReadableStream {
  const doc = new PDFKit({ size: [226, 600], margin: 10 }); // 80mm thermal-printer-friendly width

  const t = language === "ru"
    ? { title: "Товарный чек", not_fiscal: "Данный документ НЕ является фискальным чеком.", total: "Итого", date: "Дата", receipt_no: "Чек №" }
    : { title: "Sotuv kvitansiyasi", not_fiscal: "Bu hujjat FISKAL CHEK EMAS.", total: "Jami", date: "Sana", receipt_no: "Kvitansiya №" };

  doc.fontSize(12).text(storeName, { align: "center" });
  doc.fontSize(10).text(t.title, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(8).text(`${t.receipt_no}: ${sale.sale_number}`);
  doc.text(`${t.date}: ${new Date(sale.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`);
  doc.moveDown(0.5);

  for (const item of sale.items) {
    doc.text(`${item.product_name} (${item.sku})`);
    doc.text(`  ${item.quantity} x ${formatUzs(item.unit_price, language)} = ${formatUzs(item.line_total, language)}`);
  }

  doc.moveDown(0.5);
  doc.text(`${t.total}: ${formatUzs(sale.total, language)}`, { align: "right" });

  doc.moveDown(0.5);
  for (const payment of sale.payments) {
    doc.text(`${payment.method}: ${formatUzs(payment.amount, language)}`);
  }

  doc.moveDown(1);
  doc.fontSize(7).text(t.not_fiscal, { align: "center" });

  doc.end();
  return doc as unknown as NodeJS.ReadableStream;
}
