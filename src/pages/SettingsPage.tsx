import { useEffect, useState, type FormEvent } from "react";
import { getSettings, saveStore, saveTerminal, type Settings, type StoreSettings, type TerminalSettings } from "../services/settingsService";
import { APP_VERSION_LABEL } from "../lib/appVersion";

export default function SettingsPage() {
  const [data, setData] = useState<Settings>({ stores: [], terminals: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [terminal, setTerminal] = useState<TerminalSettings | null>(null);
  const [creating, setCreating] = useState(false);
  async function refresh() {
    setLoading(true); setError("");
    try { setData(await getSettings()); }
    catch { setError("Não foi possível carregar as configurações. Verifique se a função manageSettings foi publicada em HML."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function submit(event: FormEvent, kind: "store" | "terminal") {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      if (kind === "store" && store) { await saveStore(store); setStore(null); }
      if (kind === "terminal" && terminal) { await saveTerminal(terminal, creating); setTerminal(null); }
      setNotice("Configuração salva com sucesso."); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  const busy = loading || saving;
  return <section className="stock-page">
    <div className="page-heading"><div><span className="eyebrow">Administração</span><h1>Configurações</h1><p>{APP_VERSION_LABEL}</p></div><button disabled={busy} onClick={() => void refresh()}>Atualizar</button></div>
    {loading && <p role="status">Carregando…</p>}
    {error && <p className="page-error" role="alert">{error}</p>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    <h2>Lojas</h2>
    <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Nome</th><th>Endereço</th><th>Contato</th><th>Ações</th></tr></thead><tbody>{data.stores.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.address || "—"}</td><td>{item.contact || "—"}</td><td><button disabled={busy} onClick={() => { setStore({ ...item }); setTerminal(null); }}>Editar</button></td></tr>)}</tbody></table></div>
    {!loading && !data.stores.length && <p>Nenhuma loja cadastrada. Abra Estoque para inicializar a loja principal.</p>}
    {store && <form className="settings-form" onSubmit={(e) => void submit(e, "store")}><h3>Editar loja</h3><fieldset disabled={busy}>
      <label>Nome<input required minLength={2} maxLength={120} value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} /></label>
      <label>Endereço<input maxLength={300} value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} /></label>
      <label>Contato<input maxLength={120} value={store.contact} onChange={(e) => setStore({ ...store, contact: e.target.value })} /></label>
      <div className="sales-filters"><button className="primary-action">Salvar loja</button><button type="button" onClick={() => setStore(null)}>Cancelar</button></div>
    </fieldset></form>}
    <h2>Terminais</h2>
    <p>Desativar um terminal bloqueia novas consultas de produtos e novas compras. Pagamentos já iniciados continuam sendo processados.</p>
    <p>Cadastrar um terminal não vincula automaticamente um tablet. O identificador deve corresponder ao terminal configurado no checkout. Para trocar a loja, encerre primeiro o uso do terminal.</p>
    <button className="primary-action" disabled={busy || !data.stores.length} onClick={() => { setCreating(true); setStore(null); setTerminal({ id: "", name: "", storeId: data.stores[0].id, active: false }); }}>Novo terminal</button>
    <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Identificação</th><th>Nome</th><th>Loja</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{data.terminals.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{data.stores.find((s) => s.id === item.storeId)?.name ?? item.storeId}</td><td>{item.active ? "Ativo" : "Inativo"}</td><td><button disabled={busy} onClick={() => { setCreating(false); setStore(null); setTerminal({ ...item }); }}>Editar</button></td></tr>)}</tbody></table></div>
    {!loading && !data.terminals.length && <p>Nenhum terminal cadastrado.</p>}
    {terminal && <form className="settings-form" onSubmit={(e) => void submit(e, "terminal")}><h3>{creating ? "Novo terminal" : "Editar terminal"}</h3><fieldset disabled={busy}>
      {creating ? <p>A identificação será gerada automaticamente ao salvar e aparecerá na lista de terminais.</p> : <label>Identificação<input readOnly value={terminal.id} /></label>}
      <label>Nome<input required minLength={2} maxLength={120} value={terminal.name} onChange={(e) => setTerminal({ ...terminal, name: e.target.value })} /></label>
      <label>Loja<select required value={terminal.storeId} onChange={(e) => setTerminal({ ...terminal, storeId: e.target.value })}><option value="">Selecione</option>{data.stores.map((item) => <option key={item.id} value={item.id}>{item.name}{!item.active ? " (inativa)" : ""}</option>)}</select></label>
      <label>Situação<select value={String(terminal.active)} onChange={(e) => setTerminal({ ...terminal, active: e.target.value === "true" })}><option value="false">Inativo</option><option value="true">Ativo</option></select></label>
      <div className="sales-filters"><button className="primary-action">Salvar terminal</button><button type="button" onClick={() => setTerminal(null)}>Cancelar</button></div>
    </fieldset></form>}
  </section>;
}
