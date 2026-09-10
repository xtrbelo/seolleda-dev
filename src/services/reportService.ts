import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";

export function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export type PaymentMethod = "PIX" | "CARD" | "UNKNOWN";
export type FinancialAmounts = { gross: number; refunded: number; disputed: number; net: number };
export type SaleCounts = { paid: number; cancelled: number; refunded: number; chargedBack: number };
export type FinancialBreakdown = { amounts: FinancialAmounts; counts: SaleCounts };
export type Report = {
  total: number; paid: number; revenue: number; units: number; average: number;
  pending: number; expired: number; review: number; stockReview: number;
  amounts: FinancialAmounts; counts: SaleCounts; availableStores: string[];
  days: (FinancialBreakdown & { day: string })[];
  stores: (FinancialBreakdown & { storeId: string })[];
  methods: (FinancialBreakdown & { paymentMethod: PaymentMethod })[];
  rows: (FinancialBreakdown & { day: string; storeId: string; paymentMethod: PaymentMethod })[];
  products: { id: string; name: string; quantity: number; total: number }[];
};
export type Stock = { products: number; quantity: number; low: number; empty: number; negative: number };
export type ReportFilters = { storeId?: string; paymentMethod?: Exclude<PaymentMethod, "UNKNOWN"> };
type Response = { report: Report; stock?: Stock };
type Request = { fromMs: number; untilMs: number; includeStock?: boolean } & ReportFilters;
const callable = httpsCallable<Request, Response>(getFunctions(app, "southamerica-east1"), "getAdminReport");

export async function loadReport(from: string, until: string, includeStock = false, filters: ReportFilters = {}): Promise<Response> {
  const start = new Date(`${from}T00:00:00`); const end = new Date(`${until}T00:00:00`); end.setDate(end.getDate() + 1);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 94 * 86400000) throw new Error("Selecione um período de até 93 dias.");
  const result = await callable({ fromMs: start.getTime(), untilMs: end.getTime(), includeStock, ...filters });
  return result.data;
}

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const csvMoney = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function reportCsv(report: Report): string {
  const header = ["Data", "Loja", "Forma de pagamento", "Bruto (R$)", "Reembolsado (R$)", "Contestado (R$)", "Líquido (R$)", "Pagas", "Canceladas", "Estornadas", "Contestadas"];
  const lines = report.rows.map((row) => [
    row.day, row.storeId, row.paymentMethod === "UNKNOWN" ? "Não informada" : row.paymentMethod,
    csvMoney(row.amounts.gross), csvMoney(row.amounts.refunded), csvMoney(row.amounts.disputed), csvMoney(row.amounts.net),
    row.counts.paid, row.counts.cancelled, row.counts.refunded, row.counts.chargedBack,
  ]);
  lines.push(["TOTAL", "", "", csvMoney(report.amounts.gross), csvMoney(report.amounts.refunded), csvMoney(report.amounts.disputed), csvMoney(report.amounts.net), report.counts.paid, report.counts.cancelled, report.counts.refunded, report.counts.chargedBack]);
  return `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(";")).join("\r\n")}`;
}

export function downloadReportCsv(report: Report, from: string, until: string): void {
  const url = URL.createObjectURL(new Blob([reportCsv(report)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `seolleda-relatorio-${from}-a-${until}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
