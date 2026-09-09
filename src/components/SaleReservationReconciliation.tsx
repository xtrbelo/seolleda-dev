import { useState, type FormEvent } from "react";
import { reconcileSaleReservation, type AdminSale, type ReservationDifference, type ReservationReconciliation } from "../services/adminSalesService";

type Props = {
  sale: AdminSale;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onResolved: (resolution: ReservationReconciliation) => void;
};

function Differences({ items }: {items: ReservationDifference[]}) {
  return <div className="stock-table-wrap"><table className="stock-table">
    <thead><tr><th>Produto</th><th>Reservado agora</th><th>Exigido por vendas abertas</th><th>Correção</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.productId}>
      <td>{item.name}</td><td>{item.currentReserved}</td><td>{item.expectedReserved}</td>
      <td>{item.adjustment > 0 ? `+${item.adjustment}` : item.adjustment}</td>
    </tr>)}</tbody>
  </table></div>;
}

export default function SaleReservationReconciliation({ sale, busy, onBusy, onResolved }: Props) {
  const [items, setItems] = useState<ReservationDifference[]>();
  const [previewToken, setPreviewToken] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const eligible = ["EXPIRED", "CANCELLED", "REFUNDED", "CHARGED_BACK"].includes(sale.status) &&
    sale.reservationStatus === "RELEASE_REVIEW_REQUIRED" && sale.stockReconciliationRequired &&
    !sale.paymentReconciliationRequired;

  async function preview() {
    if (busy || !eligible) return;
    onBusy(true);
    setMessage("");
    try {
      const result = await reconcileSaleReservation(sale.id, "PREVIEW");
      if (result.resolution) onResolved(result.resolution);
      else {
        setItems(result.items);
        setPreviewToken(result.previewToken ?? "");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível analisar as reservas desta venda.");
    } finally { onBusy(false); }
  }

  async function apply(event: FormEvent) {
    event.preventDefault();
    if (busy || !eligible || !items || !confirmed || !previewToken) return;
    onBusy(true);
    setMessage("");
    try {
      const result = await reconcileSaleReservation(sale.id, "APPLY", reason, confirmed, previewToken);
      if (result.resolution) onResolved(result.resolution);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível aplicar a conciliação. Analise novamente antes de tentar.");
    } finally { onBusy(false); }
  }

  if (sale.reservationReconciliation) return <section aria-label="Conciliação de reservas concluída">
    <h3>Conciliação de reservas concluída</h3>
    <Differences items={sale.reservationReconciliation.items} />
    <p><strong>Motivo:</strong> {sale.reservationReconciliation.reason}</p>
    <p><strong>Responsável:</strong> {sale.reservationReconciliation.userId}</p>
    <p><strong>Data:</strong> {new Date(sale.reservationReconciliation.resolvedAtMs).toLocaleString("pt-BR")}</p>
  </section>;
  if (!eligible) return null;
  if (!items) return <section aria-label="Conciliação de reservas">
    <h3>Conciliação de reservas</h3>
    <p>A análise compara o saldo reservado com todas as vendas ainda abertas da loja.</p>
    <button type="button" disabled={busy} onClick={() => void preview()}>{busy ? "Analisando…" : "Analisar reservas"}</button>
    {message && <p role="alert">{message}</p>}
  </section>;
  return <form onSubmit={apply} aria-label="Aplicar conciliação de reservas">
    <h3>Conciliação de reservas</h3>
    <Differences items={items} />
    <p>A correção preserva as quantidades exigidas pelas outras vendas ainda reservadas.</p>
    <label>Justificativa<textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label><input type="checkbox" required checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /> Conferi os valores acima e autorizo a correção das reservas.</label>
    <button type="submit" disabled={busy || !confirmed || !previewToken}>{busy ? "Conciliando…" : "Confirmar conciliação"}</button>
    <button type="button" disabled={busy} onClick={() => { setItems(undefined); setPreviewToken(""); setConfirmed(false); setMessage(""); }}>Analisar novamente</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
