import {useEffect, useState, type FormEvent} from "react";
import {listSettingsAudit, type AuditEvent} from "../services/settingsAuditService";

function localDay() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
const date = (event: AuditEvent) => event.createdAt?.toDate().toLocaleString("pt-BR") ?? "—";
const action = (value: AuditEvent["action"]) => value === "store" ? "Loja" : value === "terminal" ? "Terminal" : "Outro";

export default function AuditPage() {
  const [from, setFrom] = useState(localDay); const [until, setUntil] = useState(localDay);
  const [events, setEvents] = useState<AuditEvent[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function load(range = {from, until}) { setLoading(true); setError(""); try { const start = new Date(`${range.from}T00:00:00`); const end = new Date(`${range.until}T00:00:00`); end.setDate(end.getDate() + 1); setEvents((await listSettingsAudit(start, end)).events); } catch { setError("Não foi possível consultar o histórico."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  function submit(event: FormEvent) { event.preventDefault(); if (!from || !until || from > until) { setError("Informe um período válido."); return; } void load({from, until}); }
  return <section className="stock-page"><div className="page-heading"><div><span className="eyebrow">Controle</span><h1>Auditoria</h1><p>Histórico das alterações administrativas de lojas e terminais.</p></div></div>
    <form className="sales-filters" onSubmit={submit}><label>De<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label><label>Até<input type="date" value={until} onChange={(event) => setUntil(event.target.value)} min={from} required /></label><button className="primary-action" disabled={loading}>Consultar</button></form>
    {error && <p className="page-error" role="alert">{error}</p>}<p role="status">{events.length} alteração(ões) carregada(s).</p>
    <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Data</th><th>Tipo</th><th>Alvo</th><th>Usuário</th><th>Alterações</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{date(event)}</td><td>{action(event.action)}</td><td>{event.targetId}</td><td>{event.userId}</td><td>{Object.entries(event.changes).map(([key, value]) => `${key}: ${String(value)}`).join("; ")}</td></tr>)}</tbody></table>{!loading && events.length === 0 && <p className="table-message">Nenhuma alteração encontrada no período.</p>}</div>{loading && <p role="status">Carregando histórico…</p>}
  </section>;
}
