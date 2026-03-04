import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { getTenants } from "../../lib/api";
import { useEffect, useState } from "react";
import Badge from "../../components/ui/badge/Badge";
import {
  ArrowUpIcon,
  BoxIconLine,
  CalenderIcon,
  GroupIcon,
} from "../../icons";

export default function Home() {
  const { user } = useAuth();
  const [tenantCount, setTenantCount] = useState<number | null>(null);
  const isRoot = user?.role === "root";

  useEffect(() => {
    if (isRoot) {
      getTenants()
        .then((d) => setTenantCount(d.tenants.length))
        .catch(() => setTenantCount(0));
    }
  }, [isRoot]);

  return (
    <>
      <PageMeta
        title="Dashboard | Colas Turnos"
        description="Panel principal del sistema de turnos"
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {isRoot ? (
          <>
            <div className="col-span-12">
              <h1 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                Panel Root
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Resumen global de la plataforma. Gestiona clínicas desde el menú.
              </p>
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4">
              <Link
                to="/clinicas"
                className="block rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-brand-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] md:p-6"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800">
                  <GroupIcon className="size-6 text-gray-800 dark:text-white/90" />
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Clínicas activas
                    </span>
                    <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                      {tenantCount === null ? "…" : tenantCount}
                    </h4>
                  </div>
                  <Badge color="primary" variant="light" size="sm">
                    Ver clínicas
                  </Badge>
                </div>
              </Link>
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4">
              <Link
                to="/line-chart"
                className="block rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-brand-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] md:p-6"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800">
                  <BoxIconLine className="size-6 text-gray-800 dark:text-white/90" />
                </div>
                <div className="mt-5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Métricas
                  </span>
                  <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                    Turnos y ocupación
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Gráficos por día y uso
                  </p>
                </div>
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="col-span-12">
              <h1 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                Bienvenido, {user?.fullName || user?.email}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Resumen del día. Usa Agenda para turnos y Nuevo turno en recepción.
              </p>
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4">
              <Link
                to="/calendar"
                className="block rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-brand-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] md:p-6"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800">
                  <CalenderIcon className="size-6 text-gray-800 dark:text-white/90" />
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Agenda
                    </span>
                    <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                      Turnos del día
                    </h4>
                  </div>
                  <Badge color="primary" variant="light" size="sm">
                    <ArrowUpIcon />
                    Abrir
                  </Badge>
                </div>
              </Link>
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4">
              <Link
                to="/form-elements"
                className="block rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-brand-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] md:p-6"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800">
                  <BoxIconLine className="size-6 text-gray-800 dark:text-white/90" />
                </div>
                <div className="mt-5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Recepción
                  </span>
                  <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                    Nuevo turno
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Dar turno a un paciente
                  </p>
                </div>
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
