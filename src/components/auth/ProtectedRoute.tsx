import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";

/**
 * Envuelve rutas que requieren login. Si no hay sesión, redirige a /signin.
 * Si debe cambiar contraseña, redirige a /change-password.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, requiresPasswordChange } = useAuth();
  const location = useLocation();
  const isChangePasswordPage = location.pathname === "/change-password";

  if (!isAuthenticated) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  if (requiresPasswordChange && !isChangePasswordPage) {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
