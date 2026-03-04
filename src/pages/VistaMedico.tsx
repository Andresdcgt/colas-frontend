import { useCallback, useEffect, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import Button from "../components/ui/button/Button";
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
  getConsultoriosColasResumen,
  reasignarTurno,
  type ConsultorioColaResumen,
} from "../lib/api";
import { Modal } from "../components/ui/modal";
import { useAuth } from "../context/AuthContext";

function groupByConsultorio(turnos: Turno[]): Map<string, { nombre: string; turnos: Turno[] }> {
  const map = new Map<string, { nombre: string; turnos: Turno[] }>();
  for (const t of turnos) {
    const key = t.consultorio_id;
    const nombre = t.consultorio_nombre ?? "Consultorio";
    if (!map.has(key)) map.set(key, { nombre, turnos: [] });
    map.get(key)!.turnos.push(t);
  }
  for (const [, g] of map) {
    g.turnos.sort((a, b) => a.orden - b.orden);
  }
  return map;
}

/** Siguiente turno a actuar: primero pendiente, o el que está llamado/en_atencion */
function siguienteEnCola(turnos: Turno[]): Turno | null {
  const activo = turnos.find((t) => t.estado === "llamado" || t.estado === "en_atencion");
  if (activo) return activo;
  return turnos.find((t) => t.estado === "pendiente") ?? null;
}

export default function VistaMedico() {
  const { user } = useAuth();

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

  const [reasignarOpen, setReasignarOpen] = useState(false);
  const [reasignarLoading, setReasignarLoading] = useState(false);
  const [reasignarError, setReasignarError] = useState<string | null>(null);
  const [reasignarConsultorioId, setReasignarConsultorioId] = useState<string>("");
  const [reasignarMotivo, setReasignarMotivo] = useState("");
  const [turnoAReasignar, setTurnoAReasignar] = useState<Turno | null>(null);
  const [consultoriosResumen, setConsultoriosResumen] = useState<ConsultorioColaResumen[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const { turnos: data } = await getTurnos({ fecha });
      setTurnos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar turnos");
      setTurnos([]);
    } finally {
      setLoading(false);
    }
  }, [fecha]);

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

  const grupos = groupByConsultorio(turnos);

  const pacienteActivo =
    turnos.find((t) => t.estado === "en_atencion") ??
    turnos.find((t) => t.estado === "llamado") ??
    null;

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

  const abrirModalReasignar = async (turno: Turno) => {
    setTurnoAReasignar(turno);
    setReasignarConsultorioId("");
    setReasignarMotivo("");
    setReasignarError(null);
    setConsultoriosResumen([]);
    setReasignarOpen(true);

    setReasignarLoading(true);
    try {
      const data = await getConsultoriosColasResumen({ fecha });
      setConsultoriosResumen(data.consultorios || []);
    } catch (e) {
      setReasignarError(
        e instanceof Error ? e.message : "Error al cargar colas de consultorios"
      );
    } finally {
      setReasignarLoading(false);
    }
  };

  const handleReasignarTurno = async () => {
    if (!turnoAReasignar) return;
    if (!reasignarConsultorioId) {
      setReasignarError("Elegí un consultorio destino para mover el turno.");
      return;
    }

    setReasignarError(null);
    setReasignarLoading(true);

    try {
      await reasignarTurno(turnoAReasignar.id, {
        consultorio_id_destino: reasignarConsultorioId,
        motivo: reasignarMotivo.trim() || undefined,
      });
      await load();
      setReasignarOpen(false);
    } catch (e) {
      setReasignarError(
        e instanceof Error
          ? e.message
          : "Error al reasignar el turno. Intenta nuevamente."
      );
    } finally {
      setReasignarLoading(false);
    }
  };

  return (
    <div>
      <PageMeta
        title="Vista Médico | Colas Turnos"
        description="Siguiente turno por consultorio"
      />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90 sm:text-3xl">
            Vista médico
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Siguiente en cola por consultorio. Llamar → En atención → Finalizar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="vista-medico-fecha" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Fecha
          </label>
          <input
            id="vista-medico-fecha"
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
        <p className="py-12 text-center text-gray-500">Cargando…</p>
      ) : grupos.size === 0 ? (
        <p className="py-12 text-center text-gray-500">
          No hay turnos para esta fecha.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
          <div className="space-y-4">
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-2">
              {Array.from(grupos.entries()).map(([consultorioId, { nombre, turnos: lista }]) => {
                const siguiente = siguienteEnCola(lista);
                return (
                  <div
                    key={consultorioId}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                      {nombre}
                    </h2>
                    {siguiente ? (
                      <div className="space-y-4">
                        <div className="rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800/80">
                          <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            Turno {siguiente.numero_turno}
                          </p>
                          <p className="mt-1 text-lg text-gray-700 dark:text-gray-300">
                            {siguiente.paciente_apellido}, {siguiente.paciente_nombre}
                          </p>
                          {siguiente.paciente_dni && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              DNI {siguiente.paciente_dni}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {siguiente.estado === "pendiente" && (
                            <Button
                              size="md"
                              disabled={updatingId === siguiente.id}
                              onClick={() => handleAction(siguiente, "llamado")}
                              className="w-full py-3 text-base font-semibold"
                            >
                              {updatingId === siguiente.id ? "…" : "Llamar siguiente"}
                            </Button>
                          )}
                          {siguiente.estado === "llamado" && (
                            <Button
                              size="md"
                              disabled={updatingId === siguiente.id}
                              onClick={() => handleAction(siguiente, "en_atencion")}
                              className="w-full py-3 text-base font-semibold"
                            >
                              {updatingId === siguiente.id ? "…" : "En atención"}
                            </Button>
                          )}
                          {siguiente.estado === "en_atencion" && (
                            <Button
                              size="md"
                              disabled={updatingId === siguiente.id}
                              onClick={() => handleAction(siguiente, "finalizado")}
                              className="w-full py-3 text-base font-semibold"
                            >
                              {updatingId === siguiente.id ? "…" : "Finalizar"}
                            </Button>
                          )}
                          {(siguiente.estado === "llamado" ||
                            siguiente.estado === "en_atencion") && (
                            <Button
                              size="md"
                              variant="outline"
                              disabled={updatingId === siguiente.id}
                              onClick={() => {
                                void abrirModalReasignar(siguiente);
                              }}
                              className="w-full py-2 text-sm font-medium"
                            >
                              Reasignar a otro consultorio
                            </Button>
                          )}
                        </div>
                        {lista.filter((t) => t.estado === "pendiente").length > 1 && (
                          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                            {lista.filter((t) => t.estado === "pendiente").length - 1} más en
                            espera
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        Sin turnos pendientes en este consultorio.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/70">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Paciente actual
              </h2>

              {!pacienteActivo ? (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  No hay ningún turno en atención en este momento. Cuando cambies un turno a
                  <span className="font-semibold"> “En atención”</span>, verás aquí los datos
                  del paciente.
                </p>
              ) : (
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <p className="text-base font-semibold text-gray-900 dark:text-white">
                      {pacienteActivo.paciente_apellido}, {pacienteActivo.paciente_nombre}
                    </p>
                    {pacienteActivo.paciente_dni && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        DNI {pacienteActivo.paciente_dni}
                      </p>
                    )}
                  </div>

                  {medicoLoading && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Cargando información del médico…
                    </p>
                  )}
                  {medicoError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{medicoError}</p>
                  )}

                  <div className="mt-2 border-t border-dashed border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <p className="font-semibold text-gray-700 dark:text-gray-300">
                      Últimas consultas
                    </p>
                    {historialLoading ? (
                      <p className="mt-1 text-xs text-gray-500">Cargando historial…</p>
                    ) : historialError ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {historialError}
                      </p>
                    ) : historialConsultas.length === 0 ? (
                      <p className="mt-1 text-xs">
                        Aún no hay consultas registradas para este paciente.
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {historialConsultas.slice(0, 3).map((c) => (
                          <li key={c.consulta_id}>
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {new Date(c.fecha_hora).toLocaleDateString()}
                            </span>
                            {c.diagnostico_ppal && (
                              <span className="text-gray-600 dark:text-gray-300">
                                {" "}
                                — {c.diagnostico_ppal}
                              </span>
                            )}
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                              Atendido por {c.medico_nombre}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setHistorialOpen(true)}
                      className="w-full justify-center"
                    >
                      Historia clínica
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/70">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Consulta actual
              </h2>

              {!pacienteActivo ? (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Seleccioná un turno y pasalo a <span className="font-semibold">“En atención”</span>{" "}
                  para registrar la consulta médica.
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
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
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

      <Modal isOpen={reasignarOpen} onClose={() => setReasignarOpen(false)} className="max-w-lg">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Reasignar a otro consultorio
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Mové el turno del consultorio actual a otro consultorio de la clínica.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Consultorio destino
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                value={reasignarConsultorioId}
                onChange={(e) => setReasignarConsultorioId(e.target.value)}
                disabled={reasignarLoading}
              >
                <option value="">Seleccioná un consultorio</option>
                {consultoriosResumen.map((c) => (
                  <option key={c.consultorio_id} value={c.consultorio_id}>
                    {c.consultorio_nombre}{" "}
                    {c.medico_nombre ? `— Dr/a ${c.medico_nombre}` : ""} ·{" "}
                    {c.pacientes_en_cola} en cola
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Motivo de retransferencia (opcional)
              </label>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                rows={2}
                value={reasignarMotivo}
                onChange={(e) => setReasignarMotivo(e.target.value)}
              />
            </div>

            {reasignarLoading && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cargando colas de consultorios…
              </p>
            )}
            {reasignarError && (
              <p className="text-sm text-red-600 dark:text-red-400">{reasignarError}</p>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                size="md"
                variant="outline"
                disabled={reasignarLoading}
                onClick={() => setReasignarOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                size="md"
                disabled={reasignarLoading}
                onClick={() => {
                  void handleReasignarTurno();
                }}
                className="w-full sm:w-auto"
              >
                {reasignarLoading ? "Moviendo…" : "Mover turno"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

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
