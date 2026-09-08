import {getFunctions, httpsCallable} from "firebase/functions";
import {app} from "../lib/firebase";

export function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export type Report = {total: number; paid: number; revenue: number; units: number; average: number; pending: number; expired: number; review: number; stockReview: number; days: {day: string; count: number; total: number}[]; products: {id: string; name: string; quantity: number; total: number}[]};
export type Stock = {products: number; quantity: number; low: number; empty: number; negative: number};
type Response = {report: Report; stock?: Stock};
const callable = httpsCallable<{fromMs: number; untilMs: number; includeStock?: boolean}, Response>(getFunctions(app, "southamerica-east1"), "getAdminReport");

export async function loadReport(from: string, until: string, includeStock = false): Promise<Response> {
  const start = new Date(`${from}T00:00:00`); const end = new Date(`${until}T00:00:00`); end.setDate(end.getDate() + 1);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 94 * 86400000) throw new Error("Selecione um período de até 93 dias.");
  const result = await callable({fromMs: start.getTime(), untilMs: end.getTime(), includeStock});
  return result.data;
}
