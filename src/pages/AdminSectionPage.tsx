type AdminSectionPageProps = {
  title: string;
  description: string;
};

function AdminSectionPage({ title, description }: AdminSectionPageProps) {
  return (
    <section className="placeholder-page">
      <span className="eyebrow">Módulo administrativo</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="empty-state compact">
        <span className="panel-icon">+</span>
        <div>
          <h2>Nenhum dado por enquanto</h2>
          <p>
            Esta tela está preparada para receber as próximas funcionalidades.
          </p>
        </div>
      </div>
    </section>
  );
}

export default AdminSectionPage;
