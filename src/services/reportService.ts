import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { listAdminSales, saleSituation, type AdminSale, type SalesCursor } from "./adminSalesService";
import type { Inventory } from "../types/inventory";

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export async function loadReport(from: string, until: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${until}T00:00:00`);
  end.setDate(end.getDate() + 1);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 94 * 86400000) throw new Error("Selecione um período de até 93 dias.");
  const sales: AdminSale[] = [];
  let cursor: SalesCursor | undefined;
  for (;;) {
    const page = await listAdminSales(start, end, cursor);
    sales.push(...page.sales);
    if (!page.hasMore) break;
    if (sales.length >= 5000) throw new Error("Reduza o período para obter um relatório completo (limite de 5.000 compras).");
    cursor = page.cursor;
  }
  return summarizeSales([...new Map(sales.map((sale) => [sale.id, sale])).values()]);
}
export function summarizeSales(sales: AdminSale[]) {
  const now = Date.now();
  const paid = sales.filter((sale) => sale.status === "PAID" && sale.paymentStatus === "APPROVED" && !sale.paymentReconciliationRequired);
  const days = new Map<string, { day: string; count: number; total: number }>();
  const products = new Map<string, { id: string; name: string; quantity: number; total: number }>();
  let revenue = 0;
  let units = 0;
  for (const sale of paid) {
    revenue += sale.totalCents;
    const day = dayKey(sale.createdAt!.toDate());
    const entry = days.get(day) ?? { day, count: 0, total: 0 };
    entry.count++;
    entry.total += sale.totalCents;
    days.set(day, entry);
    for (const item of sale.items ?? []) {
      units += item.quantity;
      const product = products.get(item.productId) ?? { id: item.productId, name: item.name, quantity: 0, total: 0 };
      product.quantity += item.quantity;
      product.total += item.totalCents;
      products.set(item.productId, product);
    }
  }
  return {
    total: sales.length, paid: paid.length, revenue, units,
    average: paid.length ? revenue / paid.length : 0,
    pending: sales.filter((sale) => saleSituation(sale, now) === "Pendente").length,
    expired: sales.filter((sale) => saleSituation(sale, now) === "Prazo encerrado").length,
    review: sales.filter((sale) => saleSituation(sale, now) === "Revisão de pagamento").length,
    stockReview: sales.filter((sale) => sale.stockReconciliationRequired).length,
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    products: [...products.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
  };
}
export async function loadStockOverview() {
  const [products, inventory] = await Promise.all([getDocs(collection(db, "products")), getDocs(collection(db, "inventory"))]);
  const stocks = inventory.docs.map((doc) => doc.data() as Inventory);
  return {
    products: products.size,
    quantity: stocks.reduce((sum, item) => sum + item.quantity, 0),
    low: stocks.filter((item) => item.quantity > 0 && item.quantity <= item.minimumQuantity).length,
    empty: stocks.filter((item) => item.quantity === 0).length,
    negative: stocks.filter((item) => item.quantity < 0).length,
  };
}
