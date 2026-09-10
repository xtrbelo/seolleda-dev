import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { dayKey, downloadReportCsv, loadReport, type FinancialAmounts, type PaymentMethod, type Report, type Stock } from "../services/reportService";
import { useStockAlertPreferences } from "../lib/stockAlertPreferences";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const methodLabel = (method: PaymentMethod) => method === "UNKNOWN" ? "Não informada" : method === "PIX" ? "Pix" : "Cartão";
function Metrics({ values }: { values: [string, string | number][] }) {
  return <div className="metric-grid">{values.map(([label, value]) => <div className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
function AmountCells({ amounts }: { amounts: FinancialAmounts }) {
  return <><td>{money(amounts.gross)}</td><td>{money(amounts.refunded)}</td><td>{money(amounts.disputed)}</td><td>{money(amounts.net)}</td></>;
}
export default function ReportsPage({ dashboard = false }: { dashboard?: boolean }) {
  const stockAlerts = useStockAlertPreferences();
  const today = dayKey(new Date());
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(today);
  const [storeId, setStoreId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | Exclude<PaymentMethod, "UNKNOWN">>("");
  const [request, setRequest] = useState(() => ({ from: today, until: today, storeId: "", paymentMethod: "" as "" | Exclude<PaymentMethod, "UNKNOWN"> }));
  const [result, setResult] = useState<{ report: Report; stock: Stock | null; updated: Date } | null>(null);
  const [storeOptions, setStoreOptions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function fetchData() {
      try {
        const response = await loadReport(request.from, request.until, dashboard, {
          ...(request.storeId ? { storeId: request.storeId } : {}),
          ...(request.paymentMethod ? { paymentMethod: request.paymentMethod } : {}),
        });
        if (active) {
          setResult({ report: response.report, stock: response.stock ?? null, updated: new Date() });
          setStoreOptions(response.report.availableStores);
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error && !("code" in failure) ? failure.message : "Não foi possível carregar os indicadores. Tente novamente.");
      } finally { if (active) setLoading(false); }
    }
    void fetchData();
    return () => { active = false; };
  }, [request, dashboard]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!from || !until || from > until) { setError("Informe um período válido."); return; }
    setLoading(true); setResult(null); setError(""); setRequest({ from, until, storeId, paymentMethod });
  }
  const filteredLabel = [request.storeId && `Loja ${request.storeId}`, request.paymentMethod && methodLabel(request.paymentMethod)].filter(Boolean).join(" · ");
  return <section className="dashboard-page">
    <div className="page-heading"><div><span className="eyebrow">Administração</span><h1>{dashboard ? "Visão geral" : "Relatórios"}</h1><p>Vendas pela data de criação da compra, no horário local.</p></div></div>
    <form className="sales-filters" onSubmit={submit}>
      <label>De<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Até<input type="date" required min={from} value={until} onChange={(event) => setUntil(event.target.value)} /></label>
      {!dashboard && <>
        <label>Loja<select value={storeId} onChange={(event) => setStoreId(event.target.value)}><option value="">Todas</option>{storeOptions.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
        <label>Forma de pagamento<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="">Todas</option><option value="PIX">Pix</option><option value="CARD">Cartão</option></select></label>
      </>}
      <button className="primary-action" disabled={loading}>Consultar / atualizar</button>
      {!dashboard && result && <button className="secondary-button" type="button" disabled={loading} onClick={() => downloadReportCsv(result.report, request.from, request.until)}>Exportar CSV</button>}
    </form>
    <p>Os valores confirmados excluem pagamentos em revisão. O líquido desconta reembolsos e contestações confirmadas; não representa lucro nem a data do repasse do provedor.</p>
    {loading && <p role="status">Carregando o período completo…</p>}
    {error && <p className="page-error" role="alert">{error}</p>}
    {result && <>
      <p>Consulta: {request.from.split("-").reverse().join("/")} a {request.until.split("-").reverse().join("/")}{filteredLabel && ` · ${filteredLabel}`} · Atualizado às {result.updated.toLocaleTimeString("pt-BR")}</p>
      {dashboard ? <Metrics values={[["Receita líquida após reembolsos e contestações", money(result.report.amounts.net)], ["Vendas pagas", result.report.counts.paid], ["Ticket médio líquido", money(result.report.average)], ["Unidades líquidas vendidas", result.report.units], ["Compras criadas", result.report.total], ["Pagamentos pendentes", result.report.pending], ["Prazo encerrado", result.report.expired], ["Revisão de pagamento", result.report.review], ["Vendas com revisão de estoque", result.report.stockReview]]} /> : <>
        <h2>Fechamento financeiro</h2>
        <Metrics values={[["Total bruto", money(result.report.amounts.gross)], ["Total reembolsado", money(result.report.amounts.refunded)], ["Total contestado", money(result.report.amounts.disputed)], ["Total líquido", money(result.report.amounts.net)]]} />
        <Metrics values={[["Vendas pagas", result.report.counts.paid], ["Vendas canceladas", result.report.counts.cancelled], ["Vendas estornadas", result.report.counts.refunded], ["Vendas contestadas", result.report.counts.chargedBack], ["Em revisão", result.report.review], ["Compras no filtro", result.report.total]]} />
      </>}
      {result.report.total === 0 && <p className="table-message">Nenhuma compra encontrada para estes filtros.</p>}
      {dashboard ? <>
        <h2>Estoque atual</h2><p>Saldo atual de todas as lojas, independente do período. Alertas contam registros de produto por loja já cadastrados no estoque.</p>
        {!result.stock && <p className="page-error">Não foi possível consultar o estoque. Use Atualizar para tentar novamente.</p>}
        {result.stock && <Metrics values={([
          ["Produtos cadastrados", result.stock.products],
          ["Saldo total em unidades", result.stock.quantity],
          ...(stockAlerts.low ? [["Registros com estoque baixo", result.stock.low] as [string, number]] : []),
          ...(stockAlerts.empty ? [["Registros sem estoque", result.stock.empty] as [string, number]] : []),
          ...(stockAlerts.negative ? [["Registros com saldo negativo", result.stock.negative] as [string, number]] : []),
        ])} />}
        {(!stockAlerts.low || !stockAlerts.empty || !stockAlerts.negative) && <p>Há alertas ocultos neste navegador. <Link to="/admin/configuracoes">Alterar preferências</Link></p>}
        <div className="sales-filters"><Link to="/admin/vendas">Consultar vendas</Link><Link to="/admin/estoque">Gerenciar estoque</Link><Link to="/admin/relatorios">Ver relatórios</Link></div>
      </> : <>
        <h2>Por forma de pagamento</h2>
        <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Forma</th><th>Bruto</th><th>Reembolsado</th><th>Contestado</th><th>Líquido</th><th>Pagas</th><th>Canceladas</th><th>Estornadas</th><th>Contestadas</th></tr></thead><tbody>{result.report.methods.map((method) => <tr key={method.paymentMethod}><td>{methodLabel(method.paymentMethod)}</td><AmountCells amounts={method.amounts} /><td>{method.counts.paid}</td><td>{method.counts.cancelled}</td><td>{method.counts.refunded}</td><td>{method.counts.chargedBack}</td></tr>)}</tbody></table></div>
        <h2>Por dia de criação</h2>
        <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Dia</th><th>Bruto</th><th>Reembolsado</th><th>Contestado</th><th>Líquido</th><th>Pagas</th><th>Canceladas</th><th>Estornadas</th><th>Contestadas</th></tr></thead><tbody>{result.report.days.map((day) => <tr key={day.day}><td>{day.day.split("-").reverse().join("/")}</td><AmountCells amounts={day.amounts} /><td>{day.counts.paid}</td><td>{day.counts.cancelled}</td><td>{day.counts.refunded}</td><td>{day.counts.chargedBack}</td></tr>)}</tbody></table></div>
        <h2>Por loja</h2>
        <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Loja</th><th>Bruto</th><th>Reembolsado</th><th>Contestado</th><th>Líquido</th><th>Pagas</th><th>Canceladas</th><th>Estornadas</th><th>Contestadas</th></tr></thead><tbody>{result.report.stores.map((store) => <tr key={store.storeId}><td>{store.storeId || "Não informada"}</td><AmountCells amounts={store.amounts} /><td>{store.counts.paid}</td><td>{store.counts.cancelled}</td><td>{store.counts.refunded}</td><td>{store.counts.chargedBack}</td></tr>)}</tbody></table></div>
        <h2>Produtos mais vendidos</h2>
        <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Produto</th><th>Unidades líquidas</th><th>Valor líquido</th></tr></thead><tbody>{result.report.products.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.quantity}</td><td>{money(product.total)}</td></tr>)}</tbody></table></div>
        {!result.report.counts.paid && <p className="table-message">Nenhuma venda paga para compor os valores líquidos.</p>}
      </>}
    </>}
  </section>;
}
