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
              <Route index element={<AdminDashboardPage />} />
              <Route path="produtos" element={<ProductsPage />} />
              <Route path="categorias" element={<CategoriesPage />} />
              <Route path="estoque" element={<StockPage />} />
              <Route path="vendas" element={<SalesPage />} />
              <Route path="relatorios" element={<ReportsPage />} />
              <Route path="configuracoes" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/checkout" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
