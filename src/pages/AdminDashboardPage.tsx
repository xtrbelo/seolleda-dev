function AdminDashboardPage() {
  return (
    <section className="dashboard-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Painel administrativo</span>
          <h1>Visão geral</h1>
        </div>
        <span className="status-badge">Estrutura inicial</span>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>Produtos cadastrados</span>
          <strong>--</strong>
        </div>
        <div className="metric-card">
          <span>Vendas recentes</span>
          <strong>--</strong>
        </div>
        <div className="metric-card">
          <span>Itens em estoque</span>
          <strong>--</strong>
        </div>
      </div>
      <div className="empty-state">
        <h2>Seu painel está pronto para crescer</h2>
        <p>Escolha uma seção no menu para continuar a construção do sistema.</p>
      </div>
    </section>
  );
}

export default AdminDashboardPage;
