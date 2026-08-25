import type { NavigationItem } from "../types/navigation";

export const adminNavigation: NavigationItem[] = [
  { label: "Visão geral", to: "/admin", end: true },
  { label: "Produtos", to: "/admin/produtos" },
  { label: "Categorias", to: "/admin/categorias" },
  { label: "Estoque", to: "/admin/estoque" },
  { label: "Vendas", to: "/admin/vendas" },
  { label: "Relatórios", to: "/admin/relatorios" },
  { label: "Configurações", to: "/admin/configuracoes" },
];
