import { useState, type FormEvent } from "react";
import { resolvePartialSaleStock, resolveSaleStock, type AdminSale, type RefundQuantity, type StockResolution } from "../services/adminSalesService";

type Props = {
  sale: AdminSale;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onResolved: (resolution: StockResolution, refundId?: string) => void;
};

export default function SaleStockResolution({ sale, busy, onBusy, onResolved }: Props) {
  const [action, setAction] = useState<"RETURN_ALL" | "NO_RETURN">("RETURN_ALL");
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [partialQuantities, setPartialQuantities] = useState<Record<string, string>>({});
  const partialRefunds = sale.partialRefunds ?? [];
  const pendingPartial = partialRefunds.find((refund) => refund.state === "CONFIRMED" && refund.stockState === "PENDING");
  const eligible = partialRefunds.length === 0 && ["REFUNDED", "CHARGED_BACK"].includes(sale.status) &&
    sale.reservationStatus === "CONSUMED" && sale.stockReconciliationRequired && !sale.paymentReconciliationRequired;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !checked || !eligible) return;
    onBusy(true);
    setMessage("");
    try {
      const resolution = await resolveSaleStock(sale.id, action, reason, checked);
      onResolved(resolution);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível confirmar a conferência. Atualize a consulta antes de tentar novamente.");
    } finally { onBusy(false); }
  }

  async function submitPartial(event: FormEvent) {
    event.preventDefault();
    if (busy || !checked || !pendingPartial) return;
    const returnedItems: RefundQuantity[] = pendingPartial.items.flatMap((item) => {
      const quantity = Number(partialQuantities[item.productId] ?? 0);
      return Number.isInteger(quantity) && quantity > 0 ? [{productId: item.productId, quantity}] : [];
    });
    onBusy(true);
    setMessage("");
    try {
      const resolution = await resolvePartialSaleStock(sale.id, pendingPartial.id, returnedItems, reason, checked);
      setPartialQuantities({});
      setReason("");
      setChecked(false);
      onResolved(resolution, pendingPartial.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível encerrar a devolução parcial. Atualize a consulta antes de tentar novamente.");
    } finally { onBusy(false); }
  }

  return <>
    {partialRefunds.length > 0 && <section className="resolution-panel" aria-label="Histórico de reembolsos parciais">
      <h3>Reembolsos por itens</h3>
      {partialRefunds.map((refund) => <div key={refund.id} className="adjustment-preview">
        <p><strong>{(refund.amountCents / 100).toLocaleString("pt-BR", {style: "currency", currency: "BRL"})}</strong> — {refund.state === "CONFIRMED" ? "confirmado" : "aguardando confirmação"}</p>
        <p>{refund.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</p>
        <p>Motivo: {refund.reason}</p>
        {refund.stockState === "RESOLVED" && <p>Conferência física encerrada: {(refund.returnedItems ?? []).length > 0 ?
          (refund.returnedItems ?? []).map((item) => `${item.quantity}× ${refund.items.find((candidate) => candidate.productId === item.productId)?.name ?? item.productId}`).join(", ") :
          "sem reposição"}. Motivo: {refund.stockReason}</p>}
      </div>)}
    </section>}
    {pendingPartial && <form className="resolution-form" onSubmit={submitPartial} aria-label="Conferência da devolução parcial">
      <h3>Conferência da devolução parcial</h3>
      <p>Informe quantas unidades deste reembolso foram recebidas em condição de voltar ao estoque. Quantidade zero encerra o item sem reposição.</p>
      {pendingPartial.items.map((item) => <label key={item.productId}>{item.name} — reembolsado: {item.quantity}
        <input type="number" min={0} max={item.quantity} step={1} disabled={busy}
          value={partialQuantities[item.productId] ?? "0"}
          onChange={(event) => { setPartialQuantities((current) => ({...current, [item.productId]: event.target.value})); setChecked(false); }} />
      </label>)}
      <label>Justificativa<textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="checkbox-label"><input type="checkbox" required checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} /> Confirmei fisicamente os itens e as quantidades que retornarão ao estoque.</label>
      <div className="form-actions"><button className="primary-action" disabled={busy || !checked} type="submit">{busy ? "Registrando…" : "Encerrar devolução parcial"}</button></div>
      {message && <p role="alert">{message}</p>}
    </form>}
    {sale.stockResolution && <section className="resolution-panel" aria-label="Conferência de estoque concluída">
      <h3>Conferência de estoque concluída</h3>
      <p>{sale.stockResolution.action === "RETURN_ALL" ? "Devolução integral registrada com reposição dos itens." : "Encerrada sem reposição de itens."}</p>
      <p><strong>Motivo:</strong> {sale.stockResolution.reason}</p>
      <p><strong>Responsável:</strong> {sale.stockResolution.userId}</p>
      <p><strong>Data:</strong> {new Date(sale.stockResolution.resolvedAtMs).toLocaleString("pt-BR")}</p>
    </section>}
    {!pendingPartial && !sale.stockResolution && eligible && <form className="resolution-form" onSubmit={submit} aria-label="Conferência de devolução">
      <h3>Conferência de devolução</h3>
      <p>Confira todos os itens desta venda antes de encerrar. A decisão é registrada uma única vez.</p>
      <label>Decisão<select disabled={busy} value={action} onChange={(event) => { setAction(event.target.value as "RETURN_ALL" | "NO_RETURN"); setChecked(false); }}>
        <option value="RETURN_ALL">Recebi todos os itens: repor estoque</option>
        <option value="NO_RETURN">Encerrar sem reposição</option>
      </select></label>
      <p>{action === "RETURN_ALL" ? "Serão repostas todas as quantidades da tabela acima. Use esta opção somente se os produtos estiverem aptos à venda e ainda não tiverem sido repostos por ajuste manual." : "O estoque será mantido. Informe por que não haverá reposição, por exemplo: itens não devolvidos, impróprios para venda ou saldo já corrigido manualmente."}</p>
      <label>Justificativa<textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="checkbox-label"><input type="checkbox" required checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} /> Confirmei a situação física dos itens e a decisão acima.</label>
      <div className="form-actions"><button className="primary-action" disabled={busy || !checked} type="submit">{busy ? "Registrando…" : action === "RETURN_ALL" ? "Confirmar devolução e repor estoque" : "Confirmar encerramento sem reposição"}</button></div>
      {message && <p role="alert">{message}</p>}
    </form>}
  </>;
}
