import { useEffect, useRef, useState, type FormEvent } from "react";
import { listAdminSales, managePayment, saleSituation, type AdminSale, type SalesCursor, type PaymentAction } from "../services/adminSalesService";
import { useAuth } from "../contexts/AuthContext";
import SaleStockResolution from "../components/SaleStockResolution";
import SaleReservationReconciliation from "../components/SaleReservationReconciliation";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: AdminSale["createdAt"]) => value?.toDate().toLocaleString("pt-BR") ?? "—";
const providerStatus = (value?: string) => ({pending: "Pendente", in_process: "Em processamento", authorized: "Autorizado", approved: "Aprovado", rejected: "Recusado", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestado"} as Record<string, string>)[value ?? ""] ?? (value || "Não consultada");
function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const paymentReviewReason = (reason?: string) => ({
  MISSING_APPROVAL_DATE: "O provedor não informou a data de aprovação.",
  APPROVED_AFTER_EXPIRATION: "O pagamento foi aprovado após o prazo da venda.",
  SALE_NOT_PENDING: "A venda já não estava pendente quando o pagamento foi aprovado.",
} as Record<string, string>)[reason ?? ""] ?? "Conferência manual necessária no provedor.";

export default function SalesPage() {
  const { roles } = useAuth();
  const [operation, setOperation] = useState<PaymentAction>("CHECK");
  const [reason, setReason] = useState("");
  const [operating, setOperating] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
  const [from, setFrom] = useState(localDay);
  const [until, setUntil] = useState(localDay);
  const [period, setPeriod] = useState({ from: localDay(), until: localDay() });
  const [sales, setSales] = useState<AdminSale[]>([]);
  const [cursor, setCursor] = useState<SalesCursor>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<AdminSale | null>(null);
  const [now, setNow] = useState(Date.now);
  const requestId = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);

  async function operate(event: FormEvent) {
    event.preventDefault();
    if (!selected || operating) return;
    setOperating(true);
    setOperationMessage("");
    try {
      const result = await managePayment(selected.id, operation, reason);
      setOperationMessage(result.confirmed ? "Encerramento confirmado pelo provedor. Feche os detalhes para ver a lista atualizada." : `Situação no provedor: ${providerStatus(result.status)}. ${operation === "CHECK" ? "Esta consulta não aprova manualmente uma venda em revisão." : "Operação enviada; consulte novamente para confirmar o resultado."}`);
      if (result.confirmed) setOperation("CHECK");
      setSelected((current) => current ? {...current, mercadoPagoPaymentStatus: result.status,
        ...(result.confirmed ? {status: result.status === "refunded" ? "REFUNDED" : result.status === "cancelled" ? "CANCELLED" : "CHARGED_BACK", paymentReconciliationRequired: false} : {})} : null);
      await load(period);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "Não foi possível confirmar a operação. Consulte novamente.");
    } finally { setOperating(false); }
  }

  async function load(range: typeof period, after?: SalesCursor) {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const start = new Date(`${range.from}T00:00:00`);
      const end = new Date(`${range.until}T00:00:00`);
      end.setDate(end.getDate() + 1);
      const result = await listAdminSales(start, end, after);
      if (id !== requestId.current) return;
      setSales((previous) => after ? [...previous, ...result.sales.filter((sale) => !previous.some((item) => item.id === sale.id))] : result.sales);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
      setNow(Date.now());
    } catch {
      if (id === requestId.current) setError("Não foi possível consultar as vendas. Verifique sua conexão e tente novamente.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load(period);
    return () => { requestId.current++; };
  }, [period]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!from || !until || from > until) { setError("Informe um período válido."); return; }
    setSales([]);
    setCursor(undefined);
    setHasMore(false);
    setPeriod({ from, until });
  }
  const needle = search.trim().toLocaleLowerCase("pt-BR");
  const visible = sales.filter((sale) => (!status || (status === "Estoque" ? sale.stockReconciliationRequired : saleSituation(sale, now) === status)) &&
    (!needle || [sale.id, sale.terminalId, sale.mercadoPagoPaymentId].some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle))));
  const paymentReviews = sales.filter((sale) => saleSituation(sale, now) === "Revisão de pagamento").length;
  const stockReviews = sales.filter((sale) => sale.stockReconciliationRequired).length;
  const pendingPayments = sales.filter((sale) => saleSituation(sale, now) === "Pendente").length;
  const paidSales = sales.filter((sale) => saleSituation(sale, now) === "Paga").length;
  const chooseStatus = (next: string) => { setStatus(next); setSelected(null); };

  return <section className="stock-page">
    <div className="page-heading"><div><span className="eyebrow">Operação</span><h1>Vendas</h1><p>Consulte compras e acompanhe pendências.</p></div></div>
    <form className="sales-filters" onSubmit={submit}>
      <label>De<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
      <label>Até<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} min={from} required /></label>
      <button className="primary-action" disabled={loading}>Consultar / atualizar</button>
    </form>
    <div className="sales-filters">
      <label>Buscar<input type="search" placeholder="Venda ou terminal" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <label>Situação<select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Todas</option>
        {["Paga", "Pendente", "Prazo encerrado", "Revisão de pagamento", "Cancelada", "Estornada", "Contestada"].map((label) => <option key={label}>{label}</option>)}
        <option value="Estoque">Revisão de estoque</option>
      </select></label>
    </div>
    <div className="payment-operations" aria-label="Resumo da operação de pagamentos">
      <button type="button" className={status === "Pendente" ? "operation-card selected" : "operation-card"} onClick={() => chooseStatus("Pendente")}><strong>{pendingPayments}</strong><span>Pagamentos pendentes</span></button>
      <button type="button" className={status === "Revisão de pagamento" ? "operation-card selected" : "operation-card"} onClick={() => chooseStatus("Revisão de pagamento")}><strong>{paymentReviews}</strong><span>Revisões de pagamento</span></button>
      <button type="button" className={status === "Estoque" ? "operation-card selected" : "operation-card"} onClick={() => chooseStatus("Estoque")}><strong>{stockReviews}</strong><span>Revisões de estoque</span></button>
      <button type="button" className={status === "Paga" ? "operation-card selected" : "operation-card"} onClick={() => chooseStatus("Paga")}><strong>{paidSales}</strong><span>Pagamentos concluídos</span></button>
    </div>
    <p role="status">{visible.length} exibida(s) de {sales.length} carregada(s). Busca e situação filtram as vendas carregadas do período consultado.</p>
    {error && <p className="page-error" role="alert">{error}</p>}
    <div className="stock-table-wrap"><table className="stock-table">
      <thead><tr><th>Data</th><th>Venda</th><th>Terminal</th><th>Total</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{visible.map((sale) => <tr key={sale.id}>
        <td>{date(sale.createdAt)}</td><td>{sale.id}</td><td>{sale.terminalId}</td><td>{money(sale.totalCents)}</td>
        <td>{saleSituation(sale, now)}{sale.stockReconciliationRequired && <small className="inactive-label">Revisar estoque</small>}</td>
        <td><button type="button" onClick={() => { setSelected(sale); setOperation("CHECK"); setReason(""); setOperationMessage(""); }} aria-label={`Ver detalhes da venda ${sale.id}`}>Detalhes</button></td>
      </tr>)}</tbody>
    </table>{!loading && visible.length === 0 && <p className="table-message">Nenhuma venda encontrada nos dados carregados.</p>}</div>
    {loading && <p role="status">Carregando vendas…</p>}
    {hasMore && <button className="secondary-button" disabled={loading} onClick={() => void load(period, cursor)}>Carregar mais vendas</button>}
    <dialog ref={dialog} className="sales-dialog" onCancel={(event) => { if (operating) event.preventDefault(); else setSelected(null); }} onClose={() => setSelected(null)} aria-labelledby="sale-detail-title">
      {selected && <>
        <div className="modal-header"><h2 id="sale-detail-title">Detalhes da venda</h2><button type="button" disabled={operating} onClick={() => setSelected(null)} aria-label="Fechar detalhes">Fechar</button></div>
        <p className="sales-id">{selected.id}</p>
        <dl className="sales-details">
          <dt>Situação</dt><dd>{saleSituation(selected, now)}</dd>
          <dt>Criada em</dt><dd>{date(selected.createdAt)}</dd>
          <dt>Pagamento confirmado em</dt><dd>{date(selected.paidAt)}</dd>
          <dt>Prazo da compra</dt><dd>{date(selected.expiresAt)}</dd>
          <dt>Loja / terminal</dt><dd>{selected.storeId} / {selected.terminalId}</dd>
          <dt>Forma de pagamento</dt><dd>{selected.paymentMethod ?? "Não selecionada"}</dd>
          <dt>Pagamento no provedor</dt><dd>{selected.mercadoPagoPaymentId ?? "—"}</dd>
        </dl>
        {saleSituation(selected, now) === "Prazo encerrado" && <p>O prazo local terminou. Isso não confirma cancelamento da cobrança no provedor.</p>}
        {(selected.paymentReconciliationRequired || selected.status === "PAYMENT_REVIEW_REQUIRED") && <p className="page-error">Pagamento exige conferência. O administrador pode consultar o provedor e solicitar reembolso integral.</p>}
        {(selected.paymentReconciliationRequired || selected.status === "PAYMENT_REVIEW_REQUIRED") && <p><strong>Motivo:</strong> {paymentReviewReason(selected.paymentReviewReason)}</p>}
        {selected.stockReconciliationRequired && <p className="page-error">Estoque exige conferência. Consulte o histórico de movimentações antes de ajustar o saldo.</p>}
        <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Produto / SKU</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead>
          <tbody>{(selected.items ?? []).map((item) => <tr key={item.productId}><td>{item.name}<small className="inactive-label">{item.sku}</small></td><td>{item.quantity}</td><td>{money(item.unitPriceCents)}</td><td>{money(item.totalCents)}</td></tr>)}</tbody></table></div>
        <p><strong>Total: {money(selected.totalCents)}</strong></p>
        {roles.includes("admin") && <SaleReservationReconciliation key={`reservation-${selected.id}`} sale={selected} busy={operating} onBusy={setOperating} onResolved={(resolution) => {
          const updated = {...selected, reservationReconciliation: resolution,
            reservationStatus: "RELEASED", stockReconciliationRequired: false};
          setSelected(updated);
          setSales((previous) => previous.map((sale) => sale.id === updated.id ? updated : sale));
        }} />}
        {roles.includes("admin") && <SaleStockResolution key={`return-${selected.id}`} sale={selected} busy={operating} onBusy={setOperating} onResolved={(resolution) => {
          const updated = {...selected, stockResolution: resolution, stockReconciliationRequired: false,
            reservationStatus: resolution.action === "RETURN_ALL" ? "RETURNED" : selected.reservationStatus};
          setSelected(updated);
          setSales((previous) => previous.map((sale) => sale.id === updated.id ? updated : sale));
        }} />}
        {roles.includes("admin") && selected.mercadoPagoPaymentId && <form onSubmit={operate}>
          <h3>Operações de pagamento</h3>
          <p>Última situação no provedor: {providerStatus(selected.mercadoPagoPaymentStatus)}.</p>
          {selected.paymentOperationState && <p>Operação registrada: {selected.paymentOperationAction === "REFUND" ? "Reembolso" : "Cancelamento"} — {selected.paymentOperationState === "CONFIRMED" ? "Confirmada" : "Aguardando confirmação"}. Motivo: {selected.paymentOperationReason || "—"}</p>}
          <label>Operação<select value={operation} disabled={operating} onChange={(event) => setOperation(event.target.value as PaymentAction)}>
            <option value="CHECK">Consultar situação no provedor</option>
            {!["CANCELLED", "REFUNDED", "CHARGED_BACK"].includes(selected.status) && <>
              <option value="CANCEL">Cancelar cobrança pendente</option>
              <option value="REFUND">Reembolsar valor integral</option>
            </>}
          </select></label>
          {operation !== "CHECK" && <>
            <label>Motivo<textarea required minLength={5} maxLength={500} value={reason} disabled={operating} onChange={(event) => setReason(event.target.value)} /></label>
            <p>{operation === "REFUND" ? `Você confirma o reembolso integral de ${money(selected.totalCents)} desta venda. Produtos vendidos não voltam automaticamente ao estoque; confira a devolução física.` : "Você confirma o cancelamento desta cobrança, se ainda estiver pendente no provedor."}</p>
          </>}
          <button type="submit" disabled={operating}>{operating ? "Consultando provedor…" : operation === "CHECK" ? "Consultar provedor" : operation === "REFUND" ? "Confirmar reembolso integral" : "Confirmar cancelamento"}</button>
          {operationMessage && <p role="status">{operationMessage}</p>}
        </form>}
      </>}
    </dialog>
  </section>;
}
