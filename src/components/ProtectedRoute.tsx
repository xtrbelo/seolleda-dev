import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function AuthLoading() {
  return (
    <main className="auth-loading" aria-live="polite">
      <span className="brand-mark">S</span>
      <p>Verificando acesso...</p>
    </main>
  );
}

export function ProtectedRoute() {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoading />;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return <AuthLoading />;
  }

  if (user && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
