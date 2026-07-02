import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";

const roleLabel: Record<string, string> = {
  root: "Root",
  admin_clinica: "Admin Clínica",
  admin_sucursal: "Admin Sucursal",
  recepcion: "Recepción",
  medico: "Médico",
};

export default function UserProfiles() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/signin", { replace: true });
  };

  return (
    <>
      <PageMeta
        title="Perfil | Colas Turnos"
        description="Datos del usuario actual"
      />
      <PageBreadcrumb pageTitle="Perfil" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          Información personal
        </h3>
        <div className="space-y-6">
          <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
            <h4 className="mb-4 text-base font-medium text-gray-800 dark:text-white/90">
              Datos de la cuenta
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                  Nombre
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {user?.fullName || "—"}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                  Email
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {user?.email || "—"}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                  Rol
                </p>
                <Badge color="primary" variant="light" size="sm">
                  {user?.role ? roleLabel[user.role] || user.role : "—"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
