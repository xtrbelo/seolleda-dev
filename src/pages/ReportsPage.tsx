import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { dayKey, loadReport, type Report, type Stock } from "../services/reportService";
import { useStockAlertPreferences } from "../lib/stockAlertPreferences";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function Metrics({ values }: { values: [string, string | number][] }) {
  return <div className="metric-grid">{values.map(([label, value]) => <div className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
export default function ReportsPage({ dashboard = false }: { dashboard?: boolean }) {
  const stockAlerts = useStockAlertPreferences();
  const [from, setFrom] = useState(() => dayKey(new Date()));
  const [until, setUntil] = useState(() => dayKey(new Date()));
  const [request, setRequest] = useState(() => ({ from: dayKey(new Date()), until: dayKey(new Date()) }));
  const [result, setResult] = useState<{ report: Report; stock: Stock | null; updated: Date } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function fetchData() {
      try {
        const response = await loadReport(request.from, request.until, dashboard);
        if (active) setResult({ report: response.report, stock: response.stock ?? null, updated: new Date() });
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
    setLoading(true); setResult(null); setError(""); setRequest({ from, until });
  }
  return <section className="dashboard-page">
    <div className="page-heading"><div><span className="eyebrow">Administração</span><h1>{dashboard ? "Visão geral" : "Relatórios"}</h1><p>Vendas de todas as lojas, pela data de criação da compra (horário local).</p></div></div>
    <form className="sales-filters" onSubmit={submit}>
      <label>De<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>Até<input type="date" required min={from} value={until} onChange={(e) => setUntil(e.target.value)} /></label>
      <button className="primary-action" disabled={loading}>Consultar / atualizar</button>
    </form>
    <p>Receita e ticket médio incluem somente vendas pagas e confirmadas, sem revisão de pagamento. Não representam lucro nem fluxo de caixa por data de recebimento.</p>
    {loading && <p role="status">Carregando o período completo…</p>}
    {error && <p className="page-error" role="alert">{error}</p>}
    {result && <>
      <p>Consulta: {request.from.split("-").reverse().join("/")} a {request.until.split("-").reverse().join("/")} · Atualizado às {result.updated.toLocaleTimeString("pt-BR")}</p>
      <Metrics values={[["Receita das vendas pagas", money(result.report.revenue)], ["Vendas pagas", result.report.paid], ["Ticket médio", money(result.report.average)], ["Unidades vendidas", result.report.units], ["Compras criadas", result.report.total], ["Pagamentos pendentes", result.report.pending], ["Prazo encerrado", result.report.expired], ["Revisão de pagamento", result.report.review], ["Vendas com revisão de estoque", result.report.stockReview]]} />
      {result.report.total === 0 && <p className="table-message">Nenhuma compra criada neste período.</p>}
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
        <h2>Vendas pagas por dia de criação</h2>
        <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Dia</th><th>Vendas pagas</th><th>Receita</th></tr></thead><tbody>{result.report.days.map((day) => <tr key={day.day}><td>{day.day.split("-").reverse().join("/")}</td><td>{day.count}</td><td>{money(day.total)}</td></tr>)}</tbody></table></div>
        <h2>Produtos mais vendidos</h2>
        <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Produto</th><th>Unidades</th><th>Valor vendido</th></tr></thead><tbody>{result.report.products.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.quantity}</td><td>{money(product.total)}</td></tr>)}</tbody></table></div>
        {!result.report.paid && <p className="table-message">Nenhuma venda paga para compor os relatórios.</p>}
      </>}
    </>}
  </section>;
}
