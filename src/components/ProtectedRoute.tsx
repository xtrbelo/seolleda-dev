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

export function ProtectedRoute({ roles = [] }: { roles?: string[] }) {
  const { user, loading, roles: userRoles } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (roles.length && !userRoles.includes("admin") && !roles.some((role) => userRoles.includes(role))) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoading />;
  }

  if (user) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
