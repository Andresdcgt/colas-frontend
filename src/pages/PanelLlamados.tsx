import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import Label from "../components/form/Label";
import TextArea from "../components/form/input/TextArea";
import { Modal } from "../components/ui/modal";
import TrasladarTurnoModal from "../components/turnos/TrasladarTurnoModal";
import { PausarTurnoModal, ReanudarTurnoModal } from "../components/turnos/TurnoPausaModals";
import { useAuth } from "../context/AuthContext";
import { filterByTenant } from "../lib/tenant-filter";
import { useTurnosSocket } from "../hooks/useTurnosSocket";
import {
  getTurnos,
  llamarTurno,
  reencolarTurno,
  updateTurnoEstado,
  marcarNoAsistio,
  MAX_LLAMADAS_TURNO,
  type Turno,
} from "../lib/api";
import { previewAnnouncement } from "../lib/announcer";

const ALERTA_INACTIVIDAD_MS = 5 * 60 * 1000;
const ALERTA_SIN_RESPUESTA_MS = 3 * 60 * 1000;
const TV_SLUG_KEY = "colas_tenant_slug";
const CONSULTORIO_PANEL_KEY = "panel_llamados_consultorio";

type ConsultorioGrupo = { id: string; nombre: string; turnos: Turno[] };

function groupByConsultorio(turnos: Turno[]): ConsultorioGrupo[] {
  const map = new Map<string, ConsultorioGrupo>();
  for (const t of turnos) {
    const key = t.consultorio_id;
    const nombre = t.consultorio_nombre ?? "Consultorio";
    if (!map.has(key)) map.set(key, { id: key, nombre, turnos: [] });
    map.get(key)!.turnos.push(t);
  }
  return Array.from(map.values())
    .map((g) => ({ ...g, turnos: [...g.turnos].sort((a, b) => a.orden - b.orden) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function minutosDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function siguientePendiente(lista: Turno[]): Turno | null {
  return lista.find((t) => t.estado === "pendiente") ?? null;
}

function indiceEnColaPendientes(lista: Turno[], turno: Turno): number {
  const pendientes = lista.filter((t) => t.estado === "pendiente");
  return pendientes.findIndex((t) => t.id === turno.id);
}

function LlamadaProgress({ veces }: { veces: number }) {
  return (
    <div className="flex items-center gap-1" title={`${veces} de ${MAX_LLAMADAS_TURNO} llamadas`}>
      {Array.from({ length: MAX_LLAMADAS_TURNO }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${
            i < veces
              ? veces >= MAX_LLAMADAS_TURNO
                ? "bg-red-500"
                : "bg-amber-500"
              : "bg-gray-200 dark:bg-gray-700"
          }`}
        />
      ))}
      <span className="ml-1.5 text-sm font-medium text-gray-600 dark:text-gray-400">
        {veces}/{MAX_LLAMADAS_TURNO} llamadas
      </span>
    </div>
  );
}

function TurnoEnLlamado({
  turno,
  canOperar,
  actionId,
  onLlamar,
  onPresente,
  onReencolar,
  onPausar,
  onNoAsistio,
  onTrasladar,
}: {
  turno: Turno;
  canOperar: boolean;
  actionId: string | null;
  onLlamar: () => void;
  onPresente: () => void;
  onReencolar: () => void;
  onPausar: () => void;
  onNoAsistio: () => void;
  onTrasladar: () => void;
}) {
  const veces = turno.veces_llamado ?? 0;
  const minLlamado = minutosDesde(turno.ultima_llamada_at);
  const busy = actionId === turno.id;
  const agotado = veces >= MAX_LLAMADAS_TURNO;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="font-mono text-4xl font-bold text-amber-700 dark:text-amber-400">
            {turno.numero_turno}
          </span>
          <p className="mt-1 text-lg font-medium text-gray-900 dark:text-white">
            {turno.paciente_apellido}, {turno.paciente_nombre}
          </p>
          <div className="mt-3">
            <LlamadaProgress veces={veces} />
            {minLlamado !== null && (
              <p className="mt-1 text-sm text-gray-500">Última llamada hace {minLlamado} min</p>
            )}
          </div>
          {agotado && (
            <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
              {MAX_LLAMADAS_TURNO} llamadas sin respuesta — confirme cierre
            </p>
          )}
        </div>
      </div>

      {canOperar && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!agotado && (
            <Button size="md" disabled={busy} onClick={onLlamar}>
              {busy ? "…" : `Re-llamar (${veces}/${MAX_LLAMADAS_TURNO})`}
            </Button>
          )}
          <Button size="md" variant="outline" disabled={busy} onClick={onPresente}>
            Presente
          </Button>
          {!agotado && (
            <Button size="md" variant="outline" disabled={busy} onClick={onPausar}>
              Pausar
            </Button>
          )}
          {!agotado && (
            <Button size="md" variant="outline" disabled={busy} onClick={onReencolar}>
              Pasar al final
            </Button>
          )}
          <Button size="md" variant="outline" disabled={busy} onClick={onTrasladar}>
            Trasladar
          </Button>
          {agotado && (
            <Button
              size="md"
              variant="outline"
              disabled={busy}
              onClick={onNoAsistio}
              className="border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
            >
              No asistió
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PanelLlamados() {
  const { user } = useAuth();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [actionId, setActionId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tvSlug, setTvSlug] = useState(() => localStorage.getItem(TV_SLUG_KEY) || "");

  const [cierreTurno, setCierreTurno] = useState<Turno | null>(null);
  const [turnoATrasladar, setTurnoATrasladar] = useState<Turno | null>(null);
  const [turnoAPausar, setTurnoAPausar] = useState<Turno | null>(null);
  const [turnoAReanudar, setTurnoAReanudar] = useState<Turno | null>(null);
  const [notaNoAsistio, setNotaNoAsistio] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [consultorioId, setConsultorioId] = useState(
    () => sessionStorage.getItem(CONSULTORIO_PANEL_KEY) || ""
  );

  const canOperar = user?.role !== "medico";
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

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const alertas = useMemo(() => {
    void tick;
    const now = Date.now();
    const pendientes = turnos.filter((t) => t.estado === "pendiente");
    const llamados = turnos.filter((t) => t.estado === "llamado");

    const ultimaLlamadaMs = turnos
      .map((t) => (t.ultima_llamada_at ? new Date(t.ultima_llamada_at).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0);

    const inactividad =
      pendientes.length > 0 &&
      (ultimaLlamadaMs === 0 || now - ultimaLlamadaMs > ALERTA_INACTIVIDAD_MS);

    const sinRespuesta = llamados.filter((t) => {
      if (!t.ultima_llamada_at) return false;
      return now - new Date(t.ultima_llamada_at).getTime() > ALERTA_SIN_RESPUESTA_MS;
    });

    const agotaronLlamadas = llamados.filter((t) => (t.veces_llamado ?? 0) >= MAX_LLAMADAS_TURNO);

    return { inactividad, sinRespuesta, agotaronLlamadas, pendientes: pendientes.length };
  }, [turnos, tick]);

  const stats = useMemo(
    () => ({
      enCola: turnos.filter((t) => ["pendiente", "llamado", "en_atencion"].includes(t.estado)).length,
      pendientes: turnos.filter((t) => t.estado === "pendiente").length,
      llamados: turnos.filter((t) => t.estado === "llamado").length,
    }),
    [turnos]
  );

  const ejecutarLlamar = async (t: Turno) => {
    setActionId(t.id);
    try {
      const actualizado = await llamarTurno(t.id);
      await load();
      if ((actualizado.veces_llamado ?? 0) >= MAX_LLAMADAS_TURNO) {
        setCierreTurno(actualizado);
        setNotaNoAsistio("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al llamar");
    } finally {
      setActionId(null);
    }
  };

  const handleLlamarSiguiente = async (lista: Turno[]) => {
    const sig = siguientePendiente(lista);
    if (!sig) {
      setError("No hay pacientes en espera en este consultorio.");
      return;
    }
    await ejecutarLlamar(sig);
  };

  const handleLlamarIndividual = async (t: Turno, lista: Turno[]) => {
    if (t.estado !== "pendiente") {
      await ejecutarLlamar(t);
      return;
    }
    const idx = indiceEnColaPendientes(lista, t);
    if (idx > 0) {
      const sig = siguientePendiente(lista);
      const ok = confirm(
        `Este paciente no es el siguiente en la cola (va en posición ${idx + 1}).\n\n` +
          `¿Llamar al turno #${t.numero_turno} de todos modos?\n` +
          (sig ? `El turno #${sig.numero_turno} sigue siendo el siguiente en orden.` : "")
      );
      if (!ok) return;
    }
    await ejecutarLlamar(t);
  };

  const handleReencolar = async (t: Turno) => {
    setActionId(t.id);
    try {
      await reencolarTurno(t.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reencolar");
    } finally {
      setActionId(null);
    }
  };

  const handlePresente = async (t: Turno) => {
    setActionId(t.id);
    try {
      await updateTurnoEstado(t.id, "en_atencion");
      setCierreTurno(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setActionId(null);
    }
  };

  const confirmarNoAsistio = async () => {
    if (!cierreTurno) return;
    const nota = notaNoAsistio.trim();
    if (nota.length < 3) {
      setError("Indica una nota explicando por qué no asistió (mín. 3 caracteres).");
      return;
    }
    setCerrando(true);
    setError("");
    try {
      await marcarNoAsistio(cierreTurno.id, nota);
      setCierreTurno(null);
      setNotaNoAsistio("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cerrar turno");
    } finally {
      setCerrando(false);
    }
  };

  const saveTvSlug = (slug: string) => {
    setTvSlug(slug);
    localStorage.setItem(TV_SLUG_KEY, slug);
  };

  const grupos = useMemo(
    () =>
      groupByConsultorio(
        turnos.filter((t) => !["finalizado", "cancelado", "no_show"].includes(t.estado))
      ),
    [turnos]
  );

  const grupoActivo = useMemo(() => {
    if (grupos.length === 0) return null;
    if (consultorioId && grupos.some((g) => g.id === consultorioId)) {
      return grupos.find((g) => g.id === consultorioId) ?? grupos[0];
    }
    const conPendientes = grupos.find((g) => g.turnos.some((t) => t.estado === "pendiente"));
    return conPendientes ?? grupos[0];
  }, [grupos, consultorioId]);

  useEffect(() => {
    if (grupos.length === 0) return;
    if (!consultorioId || !grupos.some((g) => g.id === consultorioId)) {
      const inicial = grupos.find((g) => g.turnos.some((t) => t.estado === "pendiente")) ?? grupos[0];
      setConsultorioId(inicial.id);
      sessionStorage.setItem(CONSULTORIO_PANEL_KEY, inicial.id);
    }
  }, [grupos, consultorioId]);

  const lista = grupoActivo?.turnos ?? [];
  const siguiente = siguientePendiente(lista);
  const llamadoActivo = lista.find((t) => t.estado === "llamado") ?? null;
  const enAtencion = lista.filter((t) => t.estado === "en_atencion");
  const enEspera = lista.filter((t) => t.estado === "pendiente");
  const enPausa = lista.filter((t) => t.estado === "en_pausa");

  const alertasConsultorio = useMemo(() => {
    void tick;
    if (!grupoActivo) return { sinRespuesta: [] as Turno[], agotaronLlamadas: [] as Turno[] };
    const now = Date.now();
    const llamados = lista.filter((t) => t.estado === "llamado");
    return {
      sinRespuesta: llamados.filter((t) => {
        if (!t.ultima_llamada_at) return false;
        return now - new Date(t.ultima_llamada_at).getTime() > ALERTA_SIN_RESPUESTA_MS;
      }),
      agotaronLlamadas: llamados.filter((t) => (t.veces_llamado ?? 0) >= MAX_LLAMADAS_TURNO),
    };
  }, [lista, grupoActivo, tick]);

  const seleccionarConsultorio = (id: string) => {
    setConsultorioId(id);
    sessionStorage.setItem(CONSULTORIO_PANEL_KEY, id);
  };

  const tvUrl = tvSlug.trim()
    ? `/pantalla-espera?tenant=${encodeURIComponent(tvSlug.trim())}`
    : "/pantalla-espera";

  if (user?.role === "medico") {
    return (
      <div className="p-6">
        <PageMeta title="Panel de llamados" description="Operación de cola" />
        <p className="text-gray-600">
          Esta pantalla es para recepción. Usa{" "}
          <Link to="/vista-medico" className="text-brand-500 hover:underline">
            Vista médico
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageMeta title="Panel de llamados | Colas Turnos" description="Operar la cola y llamar pacientes" />

      {/* Barra superior compacta */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Panel de llamados</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {stats.pendientes} en espera · {stats.llamados} llamados · {stats.enCola} activos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="panel-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            value={tvSlug}
            onChange={(e) => saveTvSlug(e.target.value)}
            placeholder="Slug TV"
            title="Slug clínica para pantalla TV"
            className="h-9 w-28 rounded-lg border border-gray-300 px-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <Link
            to={tvUrl}
            target="_blank"
            className="inline-flex h-9 items-center rounded-lg bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 dark:bg-gray-700"
          >
            TV ↗
          </Link>
          <button
            type="button"
            onClick={() => void previewAnnouncement()}
            className="inline-flex h-9 items-center rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
          >
            Probar voz
          </button>
        </div>
      </div>

      {alertas.inactividad && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
          role="alert"
        >
          <strong>Atención:</strong> hay {alertas.pendientes} paciente(s) en espera y hace más de 5 minutos que no
          se llama a nadie.
        </div>
      )}

      {alertas.sinRespuesta.length > 0 && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
          role="alert"
        >
          <strong>Sin respuesta reciente (global):</strong>{" "}
          {alertas.sinRespuesta.map((t) => `#${t.numero_turno}`).join(", ")}
        </div>
      )}

      {alertas.agotaronLlamadas.length > 0 && (
        <div
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-500/10 dark:text-red-200"
          role="alert"
        >
          <strong>Requieren cierre:</strong>{" "}
          {alertas.agotaronLlamadas.map((t) => `#${t.numero_turno}`).join(", ")} — ya se llamó{" "}
          {MAX_LLAMADAS_TURNO} veces. Confirma si asistió o registra no asistió con nota.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError("")}>
            Cerrar
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-gray-500">Cargando cola…</p>
      ) : grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">No hay turnos activos para esta fecha.</p>
          <Link to="/form-elements" className="mt-2 inline-block text-sm text-brand-500 hover:underline">
            Crear turno en recepción →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Lista lateral de consultorios */}
          <aside className="w-full shrink-0 lg:w-64">
            <div className="hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02] lg:block">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Consultorios</h2>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {grupos.map((g) => {
                  const pend = g.turnos.filter((t) => t.estado === "pendiente").length;
                  const llam = g.turnos.some((t) => t.estado === "llamado");
                  const activo = g.id === grupoActivo?.id;
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => seleccionarConsultorio(g.id)}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors ${
                          activo
                            ? "bg-brand-50 dark:bg-brand-500/10"
                            : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-medium ${
                              activo ? "text-brand-700 dark:text-brand-300" : "text-gray-900 dark:text-white"
                            }`}
                          >
                            {g.nombre}
                          </p>
                          <p className="text-xs text-gray-500">{g.turnos.length} activos</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {llam && (
                            <span className="h-2 w-2 rounded-full bg-amber-500" title="Hay un llamado activo" />
                          )}
                          {pend > 0 && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                              {pend}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Selector móvil redundante */}
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm lg:hidden dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              value={grupoActivo?.id ?? ""}
              onChange={(e) => seleccionarConsultorio(e.target.value)}
            >
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </aside>

          {/* Panel operativo del consultorio */}
          <main className="min-w-0 flex-1 space-y-4">
            {grupoActivo && (
              <>
                <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{grupoActivo.nombre}</h2>
                    <p className="text-sm text-gray-500">
                      {enEspera.length} en espera
                      {llamadoActivo ? ` · llamando #${llamadoActivo.numero_turno}` : ""}
                    </p>
                  </div>
                  {canOperar && (
                    <Button
                      size="md"
                      disabled={actionId !== null || !siguiente}
                      onClick={() => void handleLlamarSiguiente(lista)}
                      className="w-full shrink-0 sm:w-auto sm:min-w-[200px]"
                    >
                      {siguiente ? `Llamar siguiente · #${siguiente.numero_turno}` : "Sin pacientes en espera"}
                    </Button>
                  )}
                </div>

                {alertasConsultorio.sinRespuesta.length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                    Sin respuesta en este consultorio:{" "}
                    {alertasConsultorio.sinRespuesta.map((t) => `#${t.numero_turno}`).join(", ")}
                  </div>
                )}

                {alertasConsultorio.agotaronLlamadas.length > 0 && (
                  <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-900 dark:border-red-800 dark:bg-red-500/10 dark:text-red-200">
                    Requieren cierre:{" "}
                    {alertasConsultorio.agotaronLlamadas.map((t) => `#${t.numero_turno}`).join(", ")}
                  </div>
                )}

                {/* Turno en llamado — bloque fijo destacado */}
                {llamadoActivo && (
                  <section className="rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-5 dark:border-amber-600 dark:bg-amber-500/5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        En llamado
                      </h3>
                      <Badge color="warning" size="sm" variant="light">
                        En pantalla TV
                      </Badge>
                    </div>
                    <TurnoEnLlamado
                      turno={llamadoActivo}
                      canOperar={canOperar}
                      actionId={actionId}
                      onLlamar={() => void ejecutarLlamar(llamadoActivo)}
                      onPresente={() => void handlePresente(llamadoActivo)}
                      onReencolar={() => void handleReencolar(llamadoActivo)}
                      onPausar={() => setTurnoAPausar(llamadoActivo)}
                      onNoAsistio={() => {
                        setCierreTurno(llamadoActivo);
                        setNotaNoAsistio("");
                      }}
                      onTrasladar={() => setTurnoATrasladar(llamadoActivo)}
                    />
                  </section>
                )}

                {/* En atención */}
                {enAtencion.length > 0 && (
                  <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
                    <h3 className="border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800">
                      En consultorio ({enAtencion.length})
                    </h3>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {enAtencion.map((t) => (
                        <li key={t.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <span className="font-mono text-lg font-bold text-gray-700 dark:text-gray-300">
                              {t.numero_turno}
                            </span>
                            <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                              {t.paciente_apellido}, {t.paciente_nombre}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge color="primary" size="sm" variant="light">
                              En atención
                            </Badge>
                            {canOperar && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setTurnoAPausar(t)}
                              >
                                Pausar
                              </Button>
                            )}
                            {canOperar && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setTurnoATrasladar(t)}
                              >
                                Trasladar
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {enPausa.length > 0 && (
                  <section className="rounded-2xl border border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-500/5">
                    <h3 className="border-b border-amber-200/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-800 dark:text-amber-300">
                      En pausa ({enPausa.length})
                    </h3>
                    <ul className="divide-y divide-amber-100 dark:divide-amber-900/40">
                      {enPausa.map((t) => (
                        <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-lg font-bold text-amber-700 dark:text-amber-400">
                                {t.numero_turno}
                              </span>
                              <Badge color="warning" size="sm" variant="light">
                                Pausado
                              </Badge>
                              {t.orden_pausa != null && (
                                <span className="text-xs text-amber-700/80 dark:text-amber-400/80">
                                  Lugar #{t.orden_pausa}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {t.paciente_apellido}, {t.paciente_nombre}
                            </p>
                            {t.motivo_pausa && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t.motivo_pausa}</p>
                            )}
                          </div>
                          {canOperar && (
                            <Button size="sm" onClick={() => setTurnoAReanudar(t)}>
                              Reanudar
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Cola de espera */}
                <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
                  <h3 className="border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800">
                    Cola de espera ({enEspera.length})
                  </h3>
                  {enEspera.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-500">No hay pacientes en espera.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {enEspera.map((t, i) => {
                        const esSiguiente = siguiente?.id === t.id;
                        const busy = actionId === t.id;
                        return (
                          <li
                            key={t.id}
                            className={`flex items-center justify-between gap-3 px-4 py-3 ${
                              esSiguiente ? "border-l-4 border-l-brand-500 bg-brand-50/30 dark:bg-brand-500/5" : ""
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="w-6 text-center text-xs font-medium text-gray-400">{i + 1}</span>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xl font-bold text-brand-600 dark:text-brand-400">
                                    {t.numero_turno}
                                  </span>
                                  {esSiguiente && (
                                    <Badge color="primary" size="sm" variant="light">
                                      Siguiente
                                    </Badge>
                                  )}
                                  {t.reencolado && (
                                    <Badge color="light" size="sm" variant="light">
                                      Reencolado
                                    </Badge>
                                  )}
                                  {t.prioridad === "urgencia" && (
                                    <Badge color="error" size="sm" variant="light">
                                      URG
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                  {t.paciente_apellido}, {t.paciente_nombre}
                                </p>
                              </div>
                            </div>
                            {canOperar && !esSiguiente && (
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => void handleLlamarIndividual(t, lista)}
                                >
                                  {busy ? "…" : "Llamar fuera de orden"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => setTurnoAPausar(t)}
                                >
                                  Pausar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => setTurnoATrasladar(t)}
                                >
                                  Trasladar
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      )}

      <TrasladarTurnoModal
        turno={turnoATrasladar}
        fecha={fecha}
        onClose={() => setTurnoATrasladar(null)}
        onSuccess={() => void load()}
      />

      <PausarTurnoModal
        turno={turnoAPausar}
        onClose={() => setTurnoAPausar(null)}
        onSuccess={() => void load()}
      />

      <ReanudarTurnoModal
        turno={turnoAReanudar}
        onClose={() => setTurnoAReanudar(null)}
        onSuccess={() => void load()}
      />

      <Modal
        isOpen={!!cierreTurno}
        onClose={() => {
          if (!cerrando) setCierreTurno(null);
        }}
        className="max-w-md"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            ¿El paciente respondió?
          </h2>
          {cierreTurno && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Turno <strong>#{cierreTurno.numero_turno}</strong> — {cierreTurno.paciente_apellido},{" "}
              {cierreTurno.paciente_nombre}
              <br />
              Se realizaron {MAX_LLAMADAS_TURNO} llamadas sin que se presentara.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <Button
              className="w-full justify-center"
              disabled={cerrando || !cierreTurno}
              onClick={() => cierreTurno && void handlePresente(cierreTurno)}
            >
              Sí, se presentó — pasar a consultorio
            </Button>
          </div>

          <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
            <Label>
              No se presentó — nota obligatoria <span className="text-error-500">*</span>
            </Label>
            <TextArea
              rows={3}
              value={notaNoAsistio}
              onChange={setNotaNoAsistio}
              placeholder="Ej. no respondió tras 4 llamadas, no estaba en sala de espera…"
              disabled={cerrando}
            />
            <button
              type="button"
              disabled={cerrando || notaNoAsistio.trim().length < 3}
              onClick={() => void confirmarNoAsistio()}
              className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {cerrando ? "Guardando…" : "Cerrar turno — no asistió"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
