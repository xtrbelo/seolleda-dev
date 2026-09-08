import type { NavigationItem } from "../types/navigation";

export const adminNavigation: NavigationItem[] = [
  { label: "Visão geral", to: "/admin", end: true },
  { label: "Produtos", to: "/admin/produtos", roles: ["catalog"] },
  { label: "Categorias", to: "/admin/categorias", roles: ["catalog"] },
  { label: "Estoque", to: "/admin/estoque", roles: ["inventory"] },
  { label: "Vendas", to: "/admin/vendas", roles: ["sales"] },
  { label: "Relatórios", to: "/admin/relatorios", roles: ["reports"] },
  { label: "Configurações", to: "/admin/configuracoes", roles: ["settings"] },
  { label: "Auditoria", to: "/admin/auditoria", roles: ["settings"] },
];
