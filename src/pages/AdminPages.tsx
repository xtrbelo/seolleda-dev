import AdminSectionPage from "./AdminSectionPage";

export function ProductsPage() {
  return (
    <AdminSectionPage
      title="Produtos"
      description="Cadastre e organize o catálogo da Seolleda."
    />
  );
}

export function StockPage() {
  return (
    <AdminSectionPage
      title="Estoque"
      description="Acompanhe a disponibilidade dos seus produtos."
    />
  );
}

export function SalesPage() {
  return (
    <AdminSectionPage
      title="Vendas"
      description="Consulte os pedidos realizados pela sua operação."
    />
  );
}

export function ReportsPage() {
  return (
    <AdminSectionPage
      title="Relatórios"
      description="Visualize os principais indicadores do negócio."
    />
  );
}

export function SettingsPage() {
  return (
    <AdminSectionPage
      title="Configurações"
      description="Ajuste as preferências do sistema."
    />
  );
}
