import { useState, type FormEvent } from "react";
import { resolveSaleStock, type AdminSale, type StockResolution } from "../services/adminSalesService";

type Props = {
  sale: AdminSale;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onResolved: (resolution: StockResolution) => void;
};

export default function SaleStockResolution({ sale, busy, onBusy, onResolved }: Props) {
  const [action, setAction] = useState<StockResolution["action"]>("RETURN_ALL");
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState("");
  const eligible = ["REFUNDED", "CHARGED_BACK"].includes(sale.status) &&
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

  if (sale.stockResolution) return <section aria-label="Conferência de estoque concluída">
    <h3>Conferência de estoque concluída</h3>
    <p>{sale.stockResolution.action === "RETURN_ALL" ? "Devolução integral registrada com reposição dos itens." : "Encerrada sem reposição de itens."}</p>
    <p><strong>Motivo:</strong> {sale.stockResolution.reason}</p>
    <p><strong>Responsável:</strong> {sale.stockResolution.userId}</p>
    <p><strong>Data:</strong> {new Date(sale.stockResolution.resolvedAtMs).toLocaleString("pt-BR")}</p>
  </section>;
  if (!eligible) return null;
  return <form onSubmit={submit} aria-label="Conferência de devolução">
    <h3>Conferência de devolução</h3>
    <p>Confira todos os itens desta venda antes de encerrar. A decisão é registrada uma única vez.</p>
    <label>Decisão<select disabled={busy} value={action} onChange={(event) => { setAction(event.target.value as StockResolution["action"]); setChecked(false); }}>
      <option value="RETURN_ALL">Recebi todos os itens: repor estoque</option>
      <option value="NO_RETURN">Encerrar sem reposição</option>
    </select></label>
    <p>{action === "RETURN_ALL" ? "Serão repostas todas as quantidades da tabela acima. Use esta opção somente se os produtos estiverem aptos à venda e ainda não tiverem sido repostos por ajuste manual." : "O estoque será mantido. Informe por que não haverá reposição, por exemplo: itens não devolvidos, impróprios para venda ou saldo já corrigido manualmente."}</p>
    <label>Justificativa<textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label><input type="checkbox" required checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} /> Confirmei a situação física dos itens e a decisão acima.</label>
    <button disabled={busy || !checked} type="submit">{busy ? "Registrando…" : action === "RETURN_ALL" ? "Confirmar devolução e repor estoque" : "Confirmar encerramento sem reposição"}</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
