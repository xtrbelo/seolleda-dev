import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import AdminLayout from "./layouts/AdminLayout";
import CheckoutLayout from "./layouts/CheckoutLayout";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import {
  ReportsPage,
  SalesPage,
  SettingsPage,
  StockPage,
} from "./pages/AdminPages";
import CheckoutPage from "./pages/CheckoutPage";
import CategoriesPage from "./pages/CategoriesPage";
import ProductsPage from "./pages/ProductsPage";
import { APP_VERSION, APP_VERSION_LABEL } from "./lib/appVersion";
import AuditPage from "./pages/AuditPage";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<CheckoutLayout />}>
            <Route path="/" element={<Navigate to="/checkout" replace />} />
            <Route path="/checkout" element={<CheckoutPage />} />
          </Route>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/admin/login" element={<AdminLoginPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route element={<ProtectedRoute roles={["reports", "inventory"]} />}><Route index element={<AdminDashboardPage />} /></Route>
              <Route path="produtos" element={<ProtectedRoute roles={["catalog"]} />}><Route index element={<ProductsPage />} /></Route>
              <Route path="categorias" element={<ProtectedRoute roles={["catalog"]} />}><Route index element={<CategoriesPage />} /></Route>
              <Route path="estoque" element={<ProtectedRoute roles={["inventory"]} />}><Route index element={<StockPage />} /></Route>
              <Route path="vendas" element={<ProtectedRoute roles={["sales"]} />}><Route index element={<SalesPage />} /></Route>
              <Route path="relatorios" element={<ProtectedRoute roles={["reports"]} />}><Route index element={<ReportsPage />} /></Route>
              <Route path="configuracoes" element={<ProtectedRoute roles={["settings"]} />}><Route index element={<SettingsPage />} /></Route>
              <Route path="auditoria" element={<ProtectedRoute roles={["settings"]} />}><Route index element={<AuditPage />} /></Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/checkout" replace />} />
        </Routes>
        <small className="system-version" aria-label={`Versão do sistema ${APP_VERSION}`}>
          {APP_VERSION_LABEL}
        </small>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
