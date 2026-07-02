import { useCallback, useEffect, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { useAuth } from "../context/AuthContext";
import { filterByTenant } from "../lib/tenant-filter";
import { useTurnosSocket } from "../hooks/useTurnosSocket";
import { getTurnos, updateTurnoEstado, type Turno } from "../lib/api";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "En espera",
  llamado: "Llamado",
  en_atencion: "En atención",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  no_show: "No asistió",
};

const ESTADO_COLOR: Record<string, "primary" | "success" | "warning" | "error" | "info" | "light"> = {
  pendiente: "info",
  llamado: "warning",
  en_atencion: "success",
  finalizado: "light",
  cancelado: "error",
  no_show: "error",
};

function groupByConsultorio(turnos: Turno[]): Map<string, { nombre: string; turnos: Turno[] }> {
  const map = new Map<string, { nombre: string; turnos: Turno[] }>();
  for (const t of turnos) {
    const key = t.consultorio_id;
    const nombre = t.consultorio_nombre ?? "Consultorio";
    if (!map.has(key)) map.set(key, { nombre, turnos: [] });
    map.get(key)!.turnos.push(t);
  }
  return map;
}

export default function Blank() {
  const { user } = useAuth();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [callingId, setCallingId] = useState<string | null>(null);
  const canLlamar = user?.role !== "medico";
  const isRoot = user?.role === "root";

  const load = useCallback(async () => {
    setError("");
    try {
      const { turnos: data } = await getTurnos({ fecha });
      setTurnos(filterByTenant(data, user?.tenantId, isRoot));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar turnos");
      setTurnos([]);
    } finally {
      setLoading(false);
    }
  }, [fecha, user?.tenantId, isRoot]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useTurnosSocket(fecha, load);

  const handleLlamar = async (t: Turno) => {
    if (t.estado !== "pendiente") return;
    setCallingId(t.id);
    try {
      await updateTurnoEstado(t.id, "llamado");
      await load();
    } finally {
      setCallingId(null);
    }
  };

  const handleEnAtencion = async (t: Turno) => {
    if (t.estado !== "llamado") return;
    setCallingId(t.id);
    try {
      await updateTurnoEstado(t.id, "en_atencion");
      await load();
    } finally {
      setCallingId(null);
    }
  };

  const grupos = groupByConsultorio(turnos);

  return (
    <div>
      <PageMeta
        title="Pantalla de espera | Colas Turnos"
        description="Vista para proyección en sala de espera"
      />
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90 sm:text-3xl">
              Pantalla de espera
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Turnos del día por consultorio. Usa &quot;Llamar&quot; para avisar al paciente.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="pantalla-fecha" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Fecha
            </label>
            <input
              id="pantalla-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-gray-500">Cargando turnos…</p>
        ) : grupos.size === 0 ? (
          <p className="py-12 text-center text-gray-500">
            No hay turnos para esta fecha. Crea turnos desde &quot;Nuevo turno&quot;.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(grupos.entries()).map(([consultorioId, { nombre, turnos: lista }]) => (
              <div
                key={consultorioId}
                className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/30"
              >
                <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {nombre}
                </h2>
                <ul className="space-y-2">
                  {lista.map((t) => (
                    <li
                      key={t.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                        t.estado === "llamado" || t.estado === "en_atencion"
                          ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20"
                          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">
                          {t.numero_turno}
                        </span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {t.paciente_apellido}, {t.paciente_nombre}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          color={ESTADO_COLOR[t.estado] ?? "primary"}
                          variant="light"
                          size="sm"
                        >
                          {ESTADO_LABEL[t.estado] ?? t.estado}
                        </Badge>
                        {t.estado === "pendiente" && (
                          <Button
                            size="sm"
                            disabled={!canLlamar || callingId === t.id}
                            onClick={() => handleLlamar(t)}
                          >
                            {callingId === t.id ? "…" : "Llamar"}
                          </Button>
                        )}
                        {t.estado === "llamado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canLlamar || callingId === t.id}
                            onClick={() => handleEnAtencion(t)}
                          >
                            {callingId === t.id ? "…" : "En atención"}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Se actualiza en tiempo real por WebSocket. Para proyección en TV, abre esta página en pantalla completa.
        </p>
      </div>
    </div>
  );
}
