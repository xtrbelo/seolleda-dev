import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";

export type AdminSale = {
  id: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  mercadoPagoPaymentId?: string;
  storeId: string;
  terminalId: string;
  totalCents: number;
  createdAt?: Timestamp;
  paidAt?: Timestamp;
  expiresAt?: Timestamp;
  paymentReconciliationRequired?: boolean;
  stockReconciliationRequired?: boolean;
  paymentReviewReason?: string;
  items: { productId: string; name: string; sku: string; quantity: number; unitPriceCents: number; totalCents: number }[];
};
export type SalesCursor = QueryDocumentSnapshot<DocumentData>;

export async function listAdminSales(from: Date, until: Date, cursor?: SalesCursor) {
  const snapshot = await getDocs(query(collection(db, "sales"),
    where("createdAt", ">=", Timestamp.fromDate(from)),
    where("createdAt", "<", Timestamp.fromDate(until)),
    orderBy("createdAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
  return {
    sales: snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as AdminSale),
    cursor: snapshot.docs.at(-1),
    hasMore: snapshot.size === 100,
  };
}

export function saleSituation(sale: AdminSale, now: number): string {
  if (sale.status === "PAYMENT_REVIEW_REQUIRED" || sale.paymentReconciliationRequired) return "Revisão de pagamento";
  if (sale.status === "PAID") return "Paga";
  if (sale.status === "PENDING_PAYMENT") {
    return sale.expiresAt && sale.expiresAt.toMillis() <= now ? "Prazo encerrado" : "Pendente";
  }
  return ({ CANCELLED: "Cancelada", EXPIRED: "Prazo encerrado", REFUNDED: "Estornada" } as Record<string, string>)[sale.status] ?? sale.status;
}
