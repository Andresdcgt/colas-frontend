import { useCallback, useEffect, useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { useTurnosSocket } from "../hooks/useTurnosSocket";
import {
  getTurnos,
  updateTurnoEstado,
  type Turno,
  getHistorialPaciente,
  type ConsultaMedica,
  getMedicos,
  type Medico,
  crearConsultaMedica,
  crearReceta,
} from "../lib/api";
import { Modal } from "../components/ui/modal";
import TrasladarTurnoModal from "../components/turnos/TrasladarTurnoModal";
import { filterByTenant } from "../lib/tenant-filter";
import { useAuth } from "../context/AuthContext";

const CONSULTORIO_MEDICO_KEY = "vista_medico_consultorio";

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

function contarPorEstado(lista: Turno[], estado: string) {
  return lista.filter((t) => t.estado === estado).length;
}

export default function VistaMedico() {
  const { user } = useAuth();
  const isRoot = user?.role === "root";

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [historialOpen, setHistorialOpen] = useState(false);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState("");
  const [historialConsultas, setHistorialConsultas] = useState<ConsultaMedica[]>([]);
  const [historialPacienteNombre, setHistorialPacienteNombre] = useState<string>("");

  const [medico, setMedico] = useState<Medico | null>(null);
  const [medicoLoading, setMedicoLoading] = useState(false);
  const [medicoError, setMedicoError] = useState("");

  const [consultaForm, setConsultaForm] = useState({
    motivo_consulta: "",
    nota_evolucion: "",
    diagnostico_ppal: "",
    diagnosticos_secundarios: "",
    presion_arterial: "",
    frecuencia_cardiaca: "",
    saturacion_o2: "",
    temperatura: "",
  });
  const [consultaSaving, setConsultaSaving] = useState(false);
  const [consultaMessage, setConsultaMessage] = useState<string | null>(null);
  const [consultaError, setConsultaError] = useState<string | null>(null);

  const [ultimaConsultaId, setUltimaConsultaId] = useState<string | null>(null);

  const [recetaOpen, setRecetaOpen] = useState(false);
  const [recetaSaving, setRecetaSaving] = useState(false);
  const [recetaError, setRecetaError] = useState<string | null>(null);
  const [recetaNotasGenerales, setRecetaNotasGenerales] = useState("");
  const [recetaItems, setRecetaItems] = useState<
    {
      medicamento: string;
      dosis: string;
      frecuencia: string;
      duracion: string;
      via: string;
      observaciones: string;
    }[]
  >([
    {
      medicamento: "",
      dosis: "",
      frecuencia: "",
      duracion: "",
      via: "",
      observaciones: "",
    },
  ]);

  const [turnoATrasladar, setTurnoATrasladar] = useState<Turno | null>(null);
  const [consultorioId, setConsultorioId] = useState(
    () => sessionStorage.getItem(CONSULTORIO_MEDICO_KEY) || ""
  );

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
    if (!user || user.role !== "medico") {
      setMedico(null);
      setMedicoLoading(false);
      setMedicoError("");
      return;
    }

    let cancelled = false;
    setMedicoLoading(true);
    setMedicoError("");

    // Cargar el perfil de médico asociado al usuario logueado
    getMedicos()
      .then(({ medicos }) => {
        if (cancelled) return;
        const found = medicos.find((m) => m.user_id === user.id) ?? null;
        if (!found) {
          setMedicoError("No se encontró tu perfil de médico en esta clínica.");
        }
        setMedico(found);
      })
      .catch((e) => {
        if (cancelled) return;
        setMedicoError(
          e instanceof Error ? e.message : "Error al cargar los datos del médico"
        );
        setMedico(null);
      })
      .finally(() => {
        if (!cancelled) setMedicoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

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
    const conActividad = grupos.find((g) =>
      g.turnos.some((t) => t.estado === "en_atencion" || t.estado === "llamado")
    );
    const conPendientes = grupos.find((g) => g.turnos.some((t) => t.estado === "pendiente"));
    return conActividad ?? conPendientes ?? grupos[0];
  }, [grupos, consultorioId]);

  useEffect(() => {
    if (grupos.length === 0) return;
    if (!consultorioId || !grupos.some((g) => g.id === consultorioId)) {
      const inicial =
        grupos.find((g) => g.turnos.some((t) => t.estado === "en_atencion" || t.estado === "llamado")) ??
        grupos.find((g) => g.turnos.some((t) => t.estado === "pendiente")) ??
        grupos[0];
      setConsultorioId(inicial.id);
      sessionStorage.setItem(CONSULTORIO_MEDICO_KEY, inicial.id);
    }
  }, [grupos, consultorioId]);

  const lista = grupoActivo?.turnos ?? [];
  const pacienteEnAtencion = lista.find((t) => t.estado === "en_atencion") ?? null;
  const pacienteLlamado = lista.find((t) => t.estado === "llamado") ?? null;
  const enEspera = lista.filter((t) => t.estado === "pendiente");

  const pacienteActivo = pacienteEnAtencion ?? pacienteLlamado ?? null;

  const stats = useMemo(
    () => ({
      pendientes: turnos.filter((t) => t.estado === "pendiente").length,
      llamados: turnos.filter((t) => t.estado === "llamado").length,
      enAtencion: turnos.filter((t) => t.estado === "en_atencion").length,
    }),
    [turnos]
  );

  const seleccionarConsultorio = (id: string) => {
    setConsultorioId(id);
    sessionStorage.setItem(CONSULTORIO_MEDICO_KEY, id);
  };

  useEffect(() => {
    if (!pacienteActivo) {
      setHistorialConsultas([]);
      setHistorialPacienteNombre("");
      setHistorialError("");
      setHistorialLoading(false);
      return;
    }

    let cancelled = false;
    setHistorialError("");
    setHistorialLoading(true);

    const nombreCompleto = `${pacienteActivo.paciente_apellido ?? ""}, ${
      pacienteActivo.paciente_nombre ?? ""
    }`.trim();
    setHistorialPacienteNombre(nombreCompleto || "Paciente");

    (async () => {
      try {
        const data = await getHistorialPaciente(pacienteActivo.paciente_id);
        if (cancelled) return;
        const consultas = data.consultas || [];
        const itemsByReceta = data.itemsByReceta || {};
        setHistorialConsultas(
          consultas.map((c) => ({
            ...c,
            receta_items: c.receta_id ? itemsByReceta[c.receta_id] ?? [] : [],
          }))
        );
      } catch (e) {
        if (cancelled) return;
        setHistorialError(
          e instanceof Error ? e.message : "Error al cargar historial clínico"
        );
        setHistorialConsultas([]);
      } finally {
        if (!cancelled) setHistorialLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pacienteActivo?.id]);

  useEffect(() => {
    setConsultaForm({
      motivo_consulta: "",
      nota_evolucion: "",
      diagnostico_ppal: "",
      diagnosticos_secundarios: "",
      presion_arterial: "",
      frecuencia_cardiaca: "",
      saturacion_o2: "",
      temperatura: "",
    });
    setConsultaMessage(null);
    setConsultaError(null);
    setUltimaConsultaId(null);

    setRecetaOpen(false);
    setRecetaError(null);
    setRecetaNotasGenerales("");
    setRecetaItems([
      {
        medicamento: "",
        dosis: "",
        frecuencia: "",
        duracion: "",
        via: "",
        observaciones: "",
      },
    ]);
  }, [pacienteActivo?.id]);

  const guardarConsultaYDevolverId = async (): Promise<string | null> => {
    if (!pacienteActivo) {
      setConsultaError("No hay un paciente en atención para guardar la consulta.");
      return null;
    }
    if (!medico) {
      setConsultaError(
        "No se pudo identificar al médico actual. Verificá tu perfil o contactá al administrador."
      );
      return null;
    }

    setConsultaError(null);
    setConsultaMessage(null);

    if (
      !consultaForm.motivo_consulta.trim() &&
      !consultaForm.nota_evolucion.trim()
    ) {
      setConsultaError(
        "Ingresá al menos un motivo de consulta o una nota de evolución."
      );
      return null;
    }

    const signos_vitales: Record<string, unknown> = {};
    if (consultaForm.presion_arterial.trim()) {
      signos_vitales.presion_arterial = consultaForm.presion_arterial.trim();
    }
    if (consultaForm.frecuencia_cardiaca.trim()) {
      signos_vitales.frecuencia_cardiaca = consultaForm.frecuencia_cardiaca.trim();
    }
    if (consultaForm.saturacion_o2.trim()) {
      signos_vitales.saturacion_o2 = consultaForm.saturacion_o2.trim();
    }
    if (consultaForm.temperatura.trim()) {
      signos_vitales.temperatura = consultaForm.temperatura.trim();
    }

    try {
      const created = (await crearConsultaMedica({
        paciente_id: pacienteActivo.paciente_id,
        medico_id: medico.id,
        turno_id: pacienteActivo.id,
        motivo_consulta: consultaForm.motivo_consulta.trim() || null,
        nota_evolucion: consultaForm.nota_evolucion.trim() || null,
        diagnostico_ppal: consultaForm.diagnostico_ppal.trim() || null,
        diagnosticos_secundarios:
          consultaForm.diagnosticos_secundarios.trim() || null,
        signos_vitales:
          Object.keys(signos_vitales).length > 0 ? signos_vitales : null,
      })) as { id?: string } | null;

      const nuevaId = created?.id ?? null;
      if (nuevaId) {
        setUltimaConsultaId(nuevaId);
      }

      // Actualizar historial del paciente para reflejar la nueva consulta
      try {
        const data = await getHistorialPaciente(pacienteActivo.paciente_id);
        const consultas = data.consultas || [];
        const itemsByReceta = data.itemsByReceta || {};
        setHistorialConsultas(
          consultas.map((c) => ({
            ...c,
            receta_items: c.receta_id ? itemsByReceta[c.receta_id] ?? [] : [],
          }))
        );
      } catch {
        // Silencioso: el historial se recargará en la próxima visita
      }

      return nuevaId;
    } catch (e) {
      setConsultaError(
        e instanceof Error
          ? e.message
          : "Error al guardar la consulta. Intenta nuevamente."
      );
      return null;
    }
  };

  const handleGuardarConsulta = async () => {
    setConsultaSaving(true);
    try {
      const id = await guardarConsultaYDevolverId();
      if (id) {
        setConsultaMessage("Consulta guardada correctamente.");
      }
    } finally {
      setConsultaSaving(false);
    }
  };

  const handleGuardarYEmitirReceta = async () => {
    setConsultaSaving(true);
    try {
      const id = await guardarConsultaYDevolverId();
      if (!id) return;

      setRecetaError(null);
      setRecetaNotasGenerales("");
      setRecetaItems([
        {
          medicamento: "",
          dosis: "",
          frecuencia: "",
          duracion: "",
          via: "",
          observaciones: "",
        },
      ]);
      setRecetaOpen(true);
    } finally {
      setConsultaSaving(false);
    }
  };

  const handleAction = async (t: Turno, nextEstado: string) => {
    setUpdatingId(t.id);
    try {
      await updateTurnoEstado(t.id, nextEstado);
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleGuardarReceta = async () => {
    if (!pacienteActivo) {
      setRecetaError("No hay un paciente activo para emitir la receta.");
      return;
    }
    if (!medico) {
      setRecetaError(
        "No se pudo identificar al médico actual. Verificá tu perfil o contactá al administrador."
      );
      return;
    }

    const itemsLimpios = recetaItems
      .map((it) => ({
        ...it,
        medicamento: it.medicamento.trim(),
      }))
      .filter((it) => it.medicamento.length > 0);

    if (itemsLimpios.length === 0) {
      setRecetaError("Agregá al menos un medicamento para emitir la receta.");
      return;
    }

    setRecetaError(null);
    setRecetaSaving(true);

    try {
      await crearReceta({
        paciente_id: pacienteActivo.paciente_id,
        medico_id: medico?.id,
        consulta_id: ultimaConsultaId,
        notas_generales: recetaNotasGenerales.trim() || null,
        items: itemsLimpios,
      });

      // Refrescar historial para que la nueva receta aparezca en la vista
      try {
        const data = await getHistorialPaciente(pacienteActivo.paciente_id);
        const consultas = data.consultas || [];
        const itemsByReceta = data.itemsByReceta || {};
        setHistorialConsultas(
          consultas.map((c) => ({
            ...c,
            receta_items: c.receta_id ? itemsByReceta[c.receta_id] ?? [] : [],
          }))
        );
      } catch {
        // silencioso
      }

      setRecetaOpen(false);
    } catch (e) {
      setRecetaError(
        e instanceof Error
          ? e.message
          : "Error al guardar la receta. Intenta nuevamente."
      );
    } finally {
      setRecetaSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageMeta
        title="Vista Médico | Colas Turnos"
        description="Atención de pacientes por consultorio"
      />

      {/* Barra superior */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Vista médico</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {stats.pendientes} en espera · {stats.llamados} llamados · {stats.enAtencion} en consultorio
            {medico && (
              <span className="ml-2 text-brand-600 dark:text-brand-400">
                · Dr/a {medico.nombre}
              </span>
            )}
          </p>
        </div>
        <input
          id="vista-medico-fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {medicoError && (
        <div className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {medicoError}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-gray-500">Cargando…</p>
      ) : grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">No hay turnos activos para esta fecha.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Consultorios */}
          <aside className="w-full shrink-0 lg:w-64">
            <div className="hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02] lg:block">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Mis consultorios</h2>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {grupos.map((g) => {
                  const pend = contarPorEstado(g.turnos, "pendiente");
                  const llam = contarPorEstado(g.turnos, "llamado");
                  const atencion = contarPorEstado(g.turnos, "en_atencion");
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
                        <div className="flex shrink-0 items-center gap-1">
                          {atencion > 0 && (
                            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                              {atencion}
                            </span>
                          )}
                          {llam > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" title="Paciente llamado" />}
                          {pend > 0 && (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
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

          {/* Panel principal */}
          <main className="min-w-0 flex-1 space-y-4">
            {grupoActivo && (
              <>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{grupoActivo.nombre}</h2>
                  <p className="text-sm text-gray-500">
                    Recepción gestiona los llamados · tú recibes al paciente y finalizas la consulta
                  </p>
                </div>

                {/* Paciente en consultorio */}
                {pacienteEnAtencion && (
                  <section className="rounded-2xl border-2 border-brand-500 bg-brand-50/40 p-5 dark:border-brand-600 dark:bg-brand-500/5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-800 dark:text-brand-300">
                        En consultorio
                      </h3>
                      <Badge color="primary" size="sm" variant="light">
                        Atendiendo
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="font-mono text-4xl font-bold text-brand-700 dark:text-brand-400">
                          {pacienteEnAtencion.numero_turno}
                        </span>
                        <p className="mt-1 text-lg font-medium text-gray-900 dark:text-white">
                          {pacienteEnAtencion.paciente_apellido}, {pacienteEnAtencion.paciente_nombre}
                        </p>
                        {pacienteEnAtencion.paciente_dni && (
                          <p className="text-sm text-gray-500">DNI {pacienteEnAtencion.paciente_dni}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="md"
                          disabled={updatingId === pacienteEnAtencion.id}
                          onClick={() => void handleAction(pacienteEnAtencion, "finalizado")}
                        >
                          {updatingId === pacienteEnAtencion.id ? "…" : "Finalizar consulta"}
                        </Button>
                        <Button
                          size="md"
                          variant="outline"
                          disabled={updatingId === pacienteEnAtencion.id}
                          onClick={() => setTurnoATrasladar(pacienteEnAtencion)}
                        >
                          Trasladar
                        </Button>
                      </div>
                    </div>
                  </section>
                )}

                {/* Paciente llamado — esperando entrar */}
                {pacienteLlamado && !pacienteEnAtencion && (
                  <section className="rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-5 dark:border-amber-600 dark:bg-amber-500/5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        Paciente llamado
                      </h3>
                      <Badge color="warning" size="sm" variant="light">
                        En camino
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="font-mono text-4xl font-bold text-amber-700 dark:text-amber-400">
                          {pacienteLlamado.numero_turno}
                        </span>
                        <p className="mt-1 text-lg font-medium text-gray-900 dark:text-white">
                          {pacienteLlamado.paciente_apellido}, {pacienteLlamado.paciente_nombre}
                        </p>
                        {pacienteLlamado.paciente_dni && (
                          <p className="text-sm text-gray-500">DNI {pacienteLlamado.paciente_dni}</p>
                        )}
                        {(pacienteLlamado.veces_llamado ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Llamado {pacienteLlamado.veces_llamado} vez/veces por recepción
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="md"
                          disabled={updatingId === pacienteLlamado.id}
                          onClick={() => void handleAction(pacienteLlamado, "en_atencion")}
                        >
                          {updatingId === pacienteLlamado.id ? "…" : "Recibir en consultorio"}
                        </Button>
                        <Button
                          size="md"
                          variant="outline"
                          disabled={updatingId === pacienteLlamado.id}
                          onClick={() => setTurnoATrasladar(pacienteLlamado)}
                        >
                          Trasladar
                        </Button>
                      </div>
                    </div>
                  </section>
                )}

                {/* Sin paciente activo */}
                {!pacienteEnAtencion && !pacienteLlamado && (
                  <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 px-4 py-10 text-center dark:border-gray-700 dark:bg-gray-800/30">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      No hay paciente llamado ni en consultorio.
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Cuando recepción llame a alguien, aparecerá aquí para que lo recibas.
                    </p>
                  </section>
                )}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  {/* Cola + historial breve */}
                  <div className="space-y-4">
                    <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
                      <h3 className="border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        Cola de espera ({enEspera.length})
                      </h3>
                      {enEspera.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-gray-500">Nadie en espera.</p>
                      ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                          {enEspera.map((t, i) => (
                            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                              <span className="w-5 text-center text-xs text-gray-400">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-lg font-bold text-gray-700 dark:text-gray-300">
                                    {t.numero_turno}
                                  </span>
                                  {t.prioridad === "urgencia" && (
                                    <Badge color="error" size="sm" variant="light">
                                      URG
                                    </Badge>
                                  )}
                                </div>
                                <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                                  {t.paciente_apellido}, {t.paciente_nombre}
                                </p>
                              </div>
                              <Badge color="info" size="sm" variant="light">
                                Espera
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {pacienteActivo && (
                      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Historia clínica</h3>
                        {medicoLoading && (
                          <p className="mt-2 text-xs text-gray-500">Cargando perfil médico…</p>
                        )}
                        {historialLoading ? (
                          <p className="mt-2 text-xs text-gray-500">Cargando historial…</p>
                        ) : historialError ? (
                          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{historialError}</p>
                        ) : historialConsultas.length === 0 ? (
                          <p className="mt-2 text-xs text-gray-500">Sin consultas previas registradas.</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {historialConsultas.slice(0, 3).map((c) => (
                              <li key={c.consulta_id} className="text-xs text-gray-600 dark:text-gray-400">
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  {new Date(c.fecha_hora).toLocaleDateString()}
                                </span>
                                {c.diagnostico_ppal && ` — ${c.diagnostico_ppal}`}
                              </li>
                            ))}
                          </ul>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setHistorialOpen(true)}
                          className="mt-3 w-full justify-center"
                          disabled={!pacienteActivo}
                        >
                          Ver historia completa
                        </Button>
                      </section>
                    )}
                  </div>

                  {/* Consulta actual */}
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Consulta actual</h3>

                    {!pacienteEnAtencion ? (
                      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                        Recibí al paciente con{" "}
                        <span className="font-medium">“Recibir en consultorio”</span> para registrar motivo,
                        diagnóstico y signos vitales.
                      </p>
                    ) : (
                <form
                  className="mt-4 space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                  }}
                >
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Motivo y contexto
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Motivo de consulta
                        </label>
                        <textarea
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          rows={2}
                          value={consultaForm.motivo_consulta}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              motivo_consulta: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Nota de evolución
                        </label>
                        <textarea
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          rows={3}
                          value={consultaForm.nota_evolucion}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              nota_evolucion: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Diagnóstico
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Diagnóstico principal
                        </label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          value={consultaForm.diagnostico_ppal}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              diagnostico_ppal: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Diagnósticos secundarios
                        </label>
                        <textarea
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          rows={2}
                          value={consultaForm.diagnosticos_secundarios}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              diagnosticos_secundarios: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Signos vitales
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Presión arterial
                        </label>
                        <input
                          type="text"
                          placeholder="120/80"
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          value={consultaForm.presion_arterial}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              presion_arterial: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Frecuencia cardiaca
                        </label>
                        <input
                          type="text"
                          placeholder="72"
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          value={consultaForm.frecuencia_cardiaca}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              frecuencia_cardiaca: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Saturación O₂
                        </label>
                        <input
                          type="text"
                          placeholder="98%"
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          value={consultaForm.saturacion_o2}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              saturacion_o2: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Temperatura
                        </label>
                        <input
                          type="text"
                          placeholder="36.5 °C"
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          value={consultaForm.temperatura}
                          onChange={(e) =>
                            setConsultaForm((f) => ({
                              ...f,
                              temperatura: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {consultaError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{consultaError}</p>
                  )}
                  {consultaMessage && (
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                      {consultaMessage}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                    <Button
                      size="md"
                      disabled={consultaSaving}
                      onClick={() => {
                        void handleGuardarConsulta();
                      }}
                      className="w-full sm:w-auto"
                    >
                      {consultaSaving ? "Guardando…" : "Guardar consulta"}
                    </Button>
                    <Button
                      size="md"
                      variant="outline"
                      disabled={consultaSaving}
                      onClick={() => {
                        void handleGuardarYEmitirReceta();
                      }}
                      className="w-full sm:w-auto"
                    >
                      {consultaSaving ? "Guardando…" : "Guardar y emitir receta"}
                    </Button>
                  </div>
                </form>
                    )}
                  </section>
                </div>
              </>
            )}
          </main>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
        Se actualiza en tiempo real por WebSocket.
      </p>

      <Modal isOpen={historialOpen} onClose={() => setHistorialOpen(false)} className="max-w-3xl">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Historia clínica
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {historialPacienteNombre || "Paciente"}
          </p>

          {historialLoading ? (
            <p className="mt-6 text-sm text-gray-500">Cargando historial…</p>
          ) : historialError ? (
            <p className="mt-6 text-sm text-red-600 dark:text-red-400">{historialError}</p>
          ) : historialConsultas.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              Aún no hay consultas registradas para este paciente.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {historialConsultas.map((c) => (
                <div
                  key={c.consulta_id}
                  className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-white/90">
                        {new Date(c.fecha_hora).toLocaleString()}
                      </p>
                      {c.diagnostico_ppal && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Dx: {c.diagnostico_ppal}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Atendido por {c.medico_nombre}
                    </p>
                  </div>
                  {c.motivo_consulta && (
                    <p className="mt-2 text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">Motivo:</span> {c.motivo_consulta}
                    </p>
                  )}
                  {c.nota_evolucion && (
                    <p className="mt-1 text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">Nota:</span> {c.nota_evolucion}
                    </p>
                  )}
                  {c.signos_vitales && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Signos vitales:{" "}
                      {Object.entries(c.signos_vitales)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  )}
                  {c.receta_id && c.receta_items && c.receta_items.length > 0 && (
                    <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs dark:bg-gray-800/70">
                      <p className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                        Receta
                      </p>
                      <ul className="space-y-1">
                        {c.receta_items.map((it) => (
                          <li key={it.id} className="text-gray-700 dark:text-gray-300">
                            <span className="font-medium">{it.medicamento}</span>
                            {it.dosis && ` — ${it.dosis}`}
                            {it.frecuencia && `, ${it.frecuencia}`}
                            {it.duracion && `, ${it.duracion}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <TrasladarTurnoModal
        turno={turnoATrasladar}
        fecha={fecha}
        onClose={() => setTurnoATrasladar(null)}
        onSuccess={() => void load()}
      />

      <Modal isOpen={recetaOpen} onClose={() => setRecetaOpen(false)} className="max-w-2xl">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Nueva receta
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {pacienteActivo
              ? `${pacienteActivo.paciente_apellido}, ${pacienteActivo.paciente_nombre}`
              : "Paciente"}
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Notas generales (opcional)
              </label>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                rows={2}
                value={recetaNotasGenerales}
                onChange={(e) => setRecetaNotasGenerales(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Medicamentos
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() =>
                    setRecetaItems((items) => [
                      ...items,
                      {
                        medicamento: "",
                        dosis: "",
                        frecuencia: "",
                        duracion: "",
                        via: "",
                        observaciones: "",
                      },
                    ])
                  }
                >
                  Añadir medicamento
                </button>
              </div>

              <div className="space-y-4">
                {recetaItems.map((it, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-dashed border-gray-300 p-3 text-xs dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                            Medicamento
                          </label>
                          <input
                            type="text"
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                            value={it.medicamento}
                            onChange={(e) =>
                              setRecetaItems((items) =>
                                items.map((item, i) =>
                                  i === index ? { ...item, medicamento: e.target.value } : item
                                )
                              )
                            }
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                              Dosis
                            </label>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                              value={it.dosis}
                              onChange={(e) =>
                                setRecetaItems((items) =>
                                  items.map((item, i) =>
                                    i === index ? { ...item, dosis: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                              Frecuencia
                            </label>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                              value={it.frecuencia}
                              onChange={(e) =>
                                setRecetaItems((items) =>
                                  items.map((item, i) =>
                                    i === index ? { ...item, frecuencia: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                              Duración
                            </label>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                              value={it.duracion}
                              onChange={(e) =>
                                setRecetaItems((items) =>
                                  items.map((item, i) =>
                                    i === index ? { ...item, duracion: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                              Vía
                            </label>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                              value={it.via}
                              onChange={(e) =>
                                setRecetaItems((items) =>
                                  items.map((item, i) =>
                                    i === index ? { ...item, via: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                            Observaciones
                          </label>
                          <input
                            type="text"
                            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                            value={it.observaciones}
                            onChange={(e) =>
                              setRecetaItems((items) =>
                                items.map((item, i) =>
                                  i === index ? { ...item, observaciones: e.target.value } : item
                                )
                              )
                            }
                          />
                        </div>
                      </div>
                      {recetaItems.length > 1 && (
                        <button
                          type="button"
                          className="ml-2 mt-1 text-[11px] text-red-500 hover:text-red-600"
                          onClick={() =>
                            setRecetaItems((items) => items.filter((_, i) => i !== index))
                          }
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {recetaError && (
              <p className="text-sm text-red-600 dark:text-red-400">{recetaError}</p>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                size="md"
                variant="outline"
                disabled={recetaSaving}
                onClick={() => setRecetaOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                size="md"
                disabled={recetaSaving}
                onClick={() => {
                  void handleGuardarReceta();
                }}
                className="w-full sm:w-auto"
              >
                {recetaSaving ? "Guardando…" : "Guardar receta"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
