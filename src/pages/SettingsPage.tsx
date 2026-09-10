import { useEffect, useState, type FormEvent } from "react";
import { getSettings, saveStore, saveTerminal, type Settings, type StoreSettings, type TerminalSettings } from "../services/settingsService";
import { APP_VERSION_LABEL } from "../lib/appVersion";
import { defaultStockAlerts, saveStockAlertPreferences, useStockAlertPreferences, type StockAlertPreferences } from "../lib/stockAlertPreferences";

export default function SettingsPage() {
  const stockAlerts = useStockAlertPreferences();
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  function saveAlerts(value: StockAlertPreferences) {
    setPreferenceMessage(""); setPreferenceError("");
    try {
      saveStockAlertPreferences(value);
      setPreferenceMessage("Preferências salvas neste navegador.");
    } catch {
      setPreferenceError("Não foi possível salvar. Verifique se o navegador permite armazenamento local.");
    }
  }
  const [data, setData] = useState<Settings>({ stores: [], terminals: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [terminal, setTerminal] = useState<TerminalSettings | null>(null);
  const [creatingStore, setCreatingStore] = useState(false);
  const [creating, setCreating] = useState(false);
  async function refresh() {
    setLoading(true); setError("");
    try { setData(await getSettings()); }
    catch { setError("Não foi possível carregar as configurações. Verifique se a função manageSettings foi publicada em HML."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void getSettings().then((settings) => {
      if (active) setData(settings);
    }).catch(() => {
      if (active) setError("Não foi possível carregar as configurações. Verifique se a função manageSettings foi publicada em HML.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent, kind: "store" | "terminal") {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      if (kind === "store" && store) { await saveStore(store, creatingStore); setStore(null); setCreatingStore(false); }
      if (kind === "terminal" && terminal) { await saveTerminal(terminal, creating); setTerminal(null); }
      setNotice("Configuração salva com sucesso."); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  const busy = loading || saving;
  return (
    <section className="stock-page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Configurações</h1>
          <p>Gerencie preferências, lojas e terminais · {APP_VERSION_LABEL}</p>
        </div>
        <button className="secondary-button" disabled={busy} onClick={() => void refresh()}>
          Atualizar dados
        </button>
      </div>

      {loading && <p className="results-summary" role="status">Carregando configurações…</p>}
      {error && <p className="page-error" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}

      <section className="settings-section" aria-labelledby="stock-alerts-title">
        <div className="section-heading">
          <div>
            <h2 id="stock-alerts-title">Alertas de estoque</h2>
            <p>Escolha quais alertas aparecem em Estoque e Visão geral neste navegador.</p>
          </div>
        </div>
        <fieldset className="stock-alert-preferences">
          <legend>Exibição dos alertas</legend>
          {([
            ["low", "Exibir estoque baixo (saldo positivo até o mínimo)"],
            ["empty", "Exibir estoque zerado"],
            ["negative", "Exibir saldo negativo"],
          ] as const).map(([key, label]) => (
            <label key={key}>
              <input type="checkbox" checked={stockAlerts[key]} onChange={(event) => saveAlerts({ ...stockAlerts, [key]: event.target.checked })} />
              {label}
            </label>
          ))}
          <button className="secondary-button" type="button" onClick={() => saveAlerts(defaultStockAlerts)}>
            Restaurar alertas
          </button>
        </fieldset>
        <p className="section-note">As preferências não alteram saldos, mínimos ou regras de venda e não são sincronizadas com outros dispositivos.</p>
        {preferenceMessage && <p className="success-message" role="status">{preferenceMessage}</p>}
        {preferenceError && <p className="page-error" role="alert">{preferenceError}</p>}
      </section>

      <section className="settings-section" aria-labelledby="stores-title">
        <div className="section-heading">
          <div>
            <h2 id="stores-title">Lojas</h2>
            <p>Cadastre as unidades antes de atribuí-las a usuários e terminais.</p>
          </div>
          <button className="primary-action" disabled={busy} onClick={() => {
            setCreatingStore(true);
            setTerminal(null);
            setStore({ id: "", name: "", address: "", contact: "", active: false });
          }}>
            Nova loja
          </button>
        </div>

        <div className="stock-table-wrap settings-table-wrap">
          <table className="stock-table">
            <thead><tr><th>Nome</th><th>Endereço</th><th>Contato</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{data.stores.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong></td>
                <td>{item.address || "—"}</td>
                <td>{item.contact || "—"}</td>
                <td><span className={item.active ? "status-active" : "status-inactive"}>{item.active ? "Ativa" : "Inativa"}</span></td>
                <td className="table-actions"><button disabled={busy} onClick={() => {
                  setCreatingStore(false);
                  setStore({ ...item });
                  setTerminal(null);
                }}>Editar</button></td>
              </tr>
            ))}</tbody>
          </table>
          {!loading && !data.stores.length && <p className="table-message">Nenhuma loja cadastrada.</p>}
        </div>

        {store && (
          <form className="settings-form" onSubmit={(event) => void submit(event, "store")}>
            <h3>{creatingStore ? "Nova loja" : "Editar loja"}</h3>
            <fieldset disabled={busy}>
              <label>Nome<input required minLength={2} maxLength={120} value={store.name} onChange={(event) => setStore({ ...store, name: event.target.value })} /></label>
              <label>Endereço<input maxLength={300} value={store.address} onChange={(event) => setStore({ ...store, address: event.target.value })} /></label>
              <label>Contato<input maxLength={120} value={store.contact} onChange={(event) => setStore({ ...store, contact: event.target.value })} /></label>
              {creatingStore ? <p className="section-note">A nova loja começará inativa. Ative-a depois de revisar seus dados.</p> : (
                <label className="checkbox-label"><input type="checkbox" checked={store.active} onChange={(event) => setStore({ ...store, active: event.target.checked })} /> Loja ativa</label>
              )}
              <p className="section-note">Uma loja com terminal ativo não pode ser desativada.</p>
              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={() => { setStore(null); setCreatingStore(false); }}>Cancelar</button>
                <button className="primary-action">Salvar loja</button>
              </div>
            </fieldset>
          </form>
        )}
      </section>

      <section className="settings-section" aria-labelledby="terminals-title">
        <div className="section-heading">
          <div>
            <h2 id="terminals-title">Terminais</h2>
            <p>Controle os dispositivos autorizados a consultar produtos e iniciar compras.</p>
          </div>
          <button className="primary-action" disabled={busy || !data.stores.length} onClick={() => {
            setCreating(true);
            setCreatingStore(false);
            setStore(null);
            setTerminal({ id: "", name: "", storeId: data.stores.find((item) => item.active)?.id ?? data.stores[0].id, active: false });
          }}>
            Novo terminal
          </button>
        </div>
        <p className="section-note">Para trocar um terminal de loja, desative-o primeiro. Pagamentos já iniciados continuam sendo processados.</p>

        <div className="stock-table-wrap settings-table-wrap">
          <table className="stock-table">
            <thead><tr><th>Identificação</th><th>Nome</th><th>Loja</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{data.terminals.map((item) => (
              <tr key={item.id}>
                <td className="technical-id">{item.id}</td>
                <td><strong>{item.name}</strong></td>
                <td>{data.stores.find((candidate) => candidate.id === item.storeId)?.name ?? item.storeId}</td>
                <td><span className={item.active ? "status-active" : "status-inactive"}>{item.active ? "Ativo" : "Inativo"}</span></td>
                <td className="table-actions"><button disabled={busy} onClick={() => {
                  setCreating(false);
                  setStore(null);
                  setTerminal({ ...item });
                }}>Editar</button></td>
              </tr>
            ))}</tbody>
          </table>
          {!loading && !data.terminals.length && <p className="table-message">Nenhum terminal cadastrado.</p>}
        </div>

        {terminal && (
          <form className="settings-form" onSubmit={(event) => void submit(event, "terminal")}>
            <h3>{creating ? "Novo terminal" : "Editar terminal"}</h3>
            <fieldset disabled={busy}>
              {creating ? <p className="section-note">A identificação será gerada automaticamente ao salvar.</p> : <label>Identificação<input readOnly value={terminal.id} /></label>}
              <label>Nome<input required minLength={2} maxLength={120} value={terminal.name} onChange={(event) => setTerminal({ ...terminal, name: event.target.value })} /></label>
              <label>Loja<select required disabled={!creating && data.terminals.some((item) => item.id === terminal.id && item.active)} value={terminal.storeId} onChange={(event) => setTerminal({ ...terminal, storeId: event.target.value })}><option value="">Selecione</option>{data.stores.map((item) => <option key={item.id} value={item.id}>{item.name}{!item.active ? " (inativa)" : ""}</option>)}</select></label>
              <label>Situação<select value={String(terminal.active)} onChange={(event) => setTerminal({ ...terminal, active: event.target.value === "true" })}><option value="false">Inativo</option><option value="true">Ativo</option></select></label>
              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={() => setTerminal(null)}>Cancelar</button>
                <button className="primary-action">Salvar terminal</button>
              </div>
            </fieldset>
          </form>
        )}
      </section>
    </section>
  );
}
