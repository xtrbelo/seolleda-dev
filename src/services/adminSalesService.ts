import {Timestamp} from "firebase/firestore";
import {getFunctions, httpsCallable} from "firebase/functions";
import {app} from "../lib/firebase";

export type AdminSale = {
  reservationStatus?: string;
  stockResolution?: StockResolution;
  id: string; status: string; paymentStatus?: string; paymentMethod?: string;
  mercadoPagoPaymentId?: string; storeId: string; terminalId: string; totalCents: number;
  createdAt?: Timestamp; paidAt?: Timestamp; expiresAt?: Timestamp;
  paymentReconciliationRequired?: boolean; stockReconciliationRequired?: boolean;
  paymentReviewReason?: string;
  mercadoPagoPaymentStatus?: string;
  paymentOperationState?: string;
  paymentOperationAction?: string;
  paymentOperationReason?: string;
  items: {productId: string; name: string; sku: string; quantity: number; unitPriceCents: number; totalCents: number}[];
};
export type StockResolution = {
  action: "RETURN_ALL" | "NO_RETURN";
  reason: string;
  userId: string;
  resolvedAtMs: number;
};
export async function resolveSaleStock(saleId: string, action: StockResolution["action"], reason: string, physicallyChecked: boolean) {
  const operation = httpsCallable<{saleId: string; action: string; reason: string; physicallyChecked: boolean}, {resolution: StockResolution}>(getFunctions(app, "southamerica-east1"), "resolveSaleStock");
  return (await operation({saleId, action, reason, physicallyChecked})).data.resolution;
}
export type SalesCursor = {createdAtMs: number; id: string};
type RemoteSale = Omit<AdminSale, "createdAt" | "paidAt" | "expiresAt"> & {createdAtMs: number; paidAtMs?: number; expiresAtMs?: number};
type SalesResponse = {sales: RemoteSale[]; hasMore: boolean; cursor?: SalesCursor};
const callable = httpsCallable<{fromMs: number; untilMs: number; cursor?: SalesCursor}, SalesResponse>(getFunctions(app, "southamerica-east1"), "listAdminSales");

export async function listAdminSales(from: Date, until: Date, cursor?: SalesCursor) {
  const result = await callable({fromMs: from.getTime(), untilMs: until.getTime(), ...(cursor ? {cursor} : {})});
  return {
    sales: result.data.sales.map((sale) => ({...sale, createdAt: sale.createdAtMs ? Timestamp.fromMillis(sale.createdAtMs) : undefined, paidAt: sale.paidAtMs ? Timestamp.fromMillis(sale.paidAtMs) : undefined, expiresAt: sale.expiresAtMs ? Timestamp.fromMillis(sale.expiresAtMs) : undefined})),
    cursor: result.data.cursor, hasMore: result.data.hasMore,
  };
}

export function saleSituation(sale: AdminSale, now: number): string {
  if (sale.status === "CHARGED_BACK") return "Contestada";
  if (sale.status === "PAYMENT_REVIEW_REQUIRED" || sale.paymentReconciliationRequired) return "Revisão de pagamento";
  if (sale.status === "PAID") return "Paga";
  if (sale.status === "PENDING_PAYMENT") return sale.expiresAt && sale.expiresAt.toMillis() <= now ? "Prazo encerrado" : "Pendente";
  return ({CANCELLED: "Cancelada", EXPIRED: "Prazo encerrado", REFUNDED: "Estornada"} as Record<string, string>)[sale.status] ?? sale.status;
}

export type PaymentAction = "CHECK" | "CANCEL" | "REFUND";
export async function managePayment(saleId: string, action: PaymentAction, reason: string) {
  const operation = httpsCallable<{saleId: string; action: PaymentAction; reason: string}, {status: string; confirmed: boolean}>(getFunctions(app, "southamerica-east1"), "managePayment");
  return (await operation({saleId, action, reason})).data;
}
