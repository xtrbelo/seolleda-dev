import AdminSectionPage from "./AdminSectionPage";
export { default as StockPage } from "./StockPage";

export function ProductsPage() {
  return (
    <AdminSectionPage
      title="Produtos"
      description="Cadastre e organize o catálogo da Seolleda."
    />
  );
}

export { default as SalesPage } from "./SalesPage";

export { default as ReportsPage } from "./ReportsPage";

export function SettingsPage() {
  return (
    <AdminSectionPage
      title="Configurações"
      description="Ajuste as preferências do sistema."
    />
  );
}
