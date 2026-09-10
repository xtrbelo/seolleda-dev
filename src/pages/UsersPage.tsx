import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../contexts/useAuth";
import { ADMIN_ROLES, createAdminUser, listAdminUsers, sendAdminUserAccess, updateAdminUser, type AdminRole, type AdminUser, type AdminUserInput } from "../services/adminUserService";
import { getSettings, type StoreSettings } from "../services/settingsService";

const ROLE_LABELS: Record<AdminRole, string> = {
  admin: "Administrador",
  catalog: "Catálogo",
  inventory: "Estoque",
  sales: "Vendas",
  reports: "Relatórios",
  settings: "Configurações e auditoria",
};
const STORE_SCOPED_ROLES: AdminRole[] = ["inventory", "sales", "reports"];
type UserForm = AdminUserInput & {email: string};
const emptyForm: UserForm = {email: "", displayName: "", roles: [], storeIds: [], disabled: false};
const dateTime = (value: number) => value ? new Date(value).toLocaleString("pt-BR") : "Nunca";

export default function UsersPage() {
  const {user: currentUser} = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stores, setStores] = useState<StoreSettings[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string>();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingUid, setSendingUid] = useState("");
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AdminUser | null | undefined>(undefined);
  const [form, setForm] = useState<UserForm>(emptyForm);

  useEffect(() => {
    let active = true;
    void Promise.all([listAdminUsers(), getSettings()]).then(([accounts, settings]) => {
      if (!active) return;
      setUsers(accounts.users); setNextPageToken(accounts.nextPageToken); setStores(settings.stores);
    }).catch(() => { if (active) setPageError("Não foi possível carregar usuários e lojas. Verifique se as Functions da 1V foram publicadas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase();
    return value ? users.filter((account) => [account.displayName, account.email, account.uid].some((field) => field.toLocaleLowerCase().includes(value))) : users;
  }, [search, users]);

  function openCreate() { setEditing(null); setForm(emptyForm); setFormError(""); setNotice(""); }
  function openEdit(account: AdminUser) {
    setEditing(account);
    setForm({email: account.email, displayName: account.displayName, roles: account.roles, storeIds: account.storeIds, disabled: account.disabled});
    setFormError(""); setNotice("");
  }
  function closeModal() { if (!saving) setEditing(undefined); }
  function toggleRole(role: AdminRole) {
    setForm((current) => {
      if (role === "admin") return {...current, roles: current.roles.includes("admin") ? [] : ["admin"], storeIds: []};
      const withoutAdmin = current.roles.filter((item) => item !== "admin");
      return {...current, roles: withoutAdmin.includes(role) ? withoutAdmin.filter((item) => item !== role) : [...withoutAdmin, role]};
    });
  }
  function toggleStore(storeId: string) {
    setForm((current) => ({...current, storeIds: current.storeIds.includes(storeId) ? current.storeIds.filter((id) => id !== storeId) : [...current.storeIds, storeId]}));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setFormError(""); setNotice("");
    const displayName = form.displayName.trim().replace(/\s+/g, " ");
    const email = form.email.trim().toLowerCase();
    if (displayName.length < 2) return setFormError("Informe o nome do usuário.");
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormError("Informe um e-mail válido.");
    if (!form.roles.length) return setFormError("Selecione ao menos uma permissão.");
    if (form.roles.some((role) => STORE_SCOPED_ROLES.includes(role)) && !form.storeIds.length) return setFormError("Selecione ao menos uma loja para os papéis de estoque, vendas ou relatórios.");
    setSaving(true);
    try {
      const input = {...form, displayName, storeIds: form.roles.includes("admin") ? [] : form.storeIds};
      if (editing) {
        const updated = await updateAdminUser(editing.uid, input);
        setUsers((current) => current.map((account) => account.uid === updated.uid ? updated : account));
        setNotice("Usuário atualizado. Sessões existentes podem levar até uma hora para perder permissões já emitidas.");
      } else {
        const created = await createAdminUser(email, input);
        setUsers((current) => [created, ...current]);
        try {
          await sendAdminUserAccess(created.email);
          setNotice("Usuário criado e convite para definir a senha enviado por e-mail.");
        } catch { setNotice("Usuário criado, mas o e-mail de acesso não foi enviado. Use “Enviar acesso” na lista."); }
      }
      setEditing(undefined);
    } catch (failure) {
      const code = failure && typeof failure === "object" ? String((failure as {code?: unknown}).code ?? "") : "";
      setFormError(code.includes("already-exists") ? "Já existe uma conta com este e-mail." : code.includes("failed-precondition") ? "Sua própria conta não pode ser alterada neste painel." : "Não foi possível salvar o usuário. Confira os dados e tente novamente.");
    } finally { setSaving(false); }
  }
  async function loadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true); setPageError("");
    try {
      const response = await listAdminUsers(nextPageToken);
      setUsers((current) => [...current, ...response.users]); setNextPageToken(response.nextPageToken);
    } catch { setPageError("Não foi possível carregar a próxima página de usuários."); }
    finally { setLoadingMore(false); }
  }
  async function sendAccess(account: AdminUser) {
    if (!account.email) return;
    setSendingUid(account.uid); setPageError(""); setNotice("");
    try { await sendAdminUserAccess(account.email); setNotice(`E-mail de acesso enviado para ${account.email}.`); }
    catch { setPageError("Não foi possível enviar o e-mail de acesso. Confira o provedor de e-mail/senha no Firebase Authentication."); }
    finally { setSendingUid(""); }
  }
  const selfUid = currentUser?.uid ?? "";
  return <section className="products-page">
    <div className="page-heading products-heading"><div><span className="eyebrow">Administração</span><h1>Usuários e permissões</h1><p>Gerencie o acesso interno ao painel. Contas desativadas não conseguem renovar a sessão.</p></div><button className="primary-action" onClick={openCreate}>+ Novo usuário</button></div>
    <div className="products-toolbar"><label htmlFor="user-search">Buscar nos usuários carregados</label><input id="user-search" type="search" placeholder="Nome, e-mail ou identificação" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    {pageError && <p className="page-error" role="alert">{pageError}</p>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    <p>Alterações de permissão revogam tokens de renovação. Por uma limitação do Firebase Authentication, tokens já emitidos podem continuar válidos por até uma hora.</p>
    <div className="product-table-wrap">{loading ? <p className="table-message">Carregando usuários…</p> : filtered.length === 0 ? <p className="table-message">Nenhum usuário encontrado.</p> : <table className="product-table"><thead><tr><th>Usuário</th><th>Permissões</th><th>Lojas</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>{filtered.map((account) => <tr key={account.uid}><td><strong>{account.displayName || "Sem nome"}</strong><small>{account.email || account.uid}</small></td><td>{account.roles.map((role) => ROLE_LABELS[role]).join(", ") || "Sem acesso"}</td><td>{account.roles.includes("admin") ? "Todas" : account.storeIds.map((id) => stores.find((store) => store.id === id)?.name ?? id).join(", ") || "—"}</td><td><span className={account.disabled ? "status-inactive" : "status-active"}>{account.disabled ? "Inativo" : "Ativo"}</span>{account.uid === selfUid && <small>Sua conta</small>}</td><td>{dateTime(account.lastSignInAtMs)}</td><td className="category-actions"><button disabled={account.uid === selfUid} onClick={() => openEdit(account)}>{account.uid === selfUid ? "Protegida" : "Editar"}</button><button disabled={!account.email || sendingUid === account.uid || account.disabled} onClick={() => void sendAccess(account)}>{sendingUid === account.uid ? "Enviando…" : "Enviar acesso"}</button></td></tr>)}</tbody></table>}</div>
    {nextPageToken && !search && <button className="secondary-button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Carregando…" : "Carregar mais 100"}</button>}
    {editing !== undefined && <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}><div className="category-modal product-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">Acesso administrativo</span><h2 id="user-modal-title">{editing ? "Editar usuário" : "Novo usuário"}</h2></div><button type="button" className="modal-close" onClick={closeModal} aria-label="Fechar">×</button></div><form onSubmit={(event) => void submit(event)}>
      <label htmlFor="user-name">Nome</label><input id="user-name" required minLength={2} maxLength={100} autoFocus value={form.displayName} onChange={(event) => setForm({...form, displayName: event.target.value})} />
      <label htmlFor="user-email">E-mail</label><input id="user-email" type="email" required readOnly={Boolean(editing)} maxLength={320} value={form.email} onChange={(event) => setForm({...form, email: event.target.value})} />
      <fieldset className="user-permission-options"><legend>Permissões</legend>{ADMIN_ROLES.map((role) => <label className="checkbox-label" key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} /> {ROLE_LABELS[role]}</label>)}</fieldset>
      {!form.roles.includes("admin") && <fieldset className="user-permission-options"><legend>Lojas atribuídas</legend>{stores.length ? stores.map((store) => <label className="checkbox-label" key={store.id}><input type="checkbox" checked={form.storeIds.includes(store.id)} onChange={() => toggleStore(store.id)} /> {store.name}{!store.active ? " (inativa)" : ""}</label>) : <p>Nenhuma loja disponível.</p>}</fieldset>}
      {editing && <label className="checkbox-label"><input type="checkbox" checked={!form.disabled} onChange={(event) => setForm({...form, disabled: !event.target.checked})} /> Usuário ativo</label>}
      <p>{editing ? "Ao salvar, as sessões de renovação deste usuário serão revogadas." : "O usuário receberá um e-mail para definir a própria senha após a criação."}</p>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={saving} onClick={closeModal}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving ? "Salvando…" : "Salvar usuário"}</button></div>
    </form></div></div>}
  </section>;
}
