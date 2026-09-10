import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { hasRoleAccess } from "../lib/adminRoles";

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

  if (roles.length && !roles.some((role) => hasRoleAccess(userRoles, role))) {
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
