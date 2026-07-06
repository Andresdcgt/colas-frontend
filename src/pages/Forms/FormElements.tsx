import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { useAuth } from "../../context/AuthContext";
import { useTurnosSocket } from "../../hooks/useTurnosSocket";
import { filterByTenant } from "../../lib/tenant-filter";
import {
  getConsultorios,
  getPacientes,
  getTurnos,
  createTurno,
  enviarTurno,
  cancelarTurno,
  recuperarTurno,
  type Consultorio,
  type Paciente,
  type Turno,
} from "../../lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Modal } from "../../components/ui/modal";
import TextArea from "../../components/form/input/TextArea";

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
  en_atencion: "primary",
  finalizado: "success",
  cancelado: "error",
  no_show: "light",
};

type ListaFiltro = "activos" | "finalizados" | "cancelados" | "todos";

const ACTIVOS = new Set(["pendiente", "llamado", "en_atencion"]);
const CANCELABLES = new Set(["pendiente", "llamado", "en_atencion"]);
const CANCELADOS = new Set(["cancelado", "no_show"]);

function formatHora(hora: string): string {
  return String(hora).slice(0, 5);
}

function formatFechaLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const key = (x: Date) => x.toISOString().slice(0, 10);
  if (iso === key(hoy)) return "Hoy";
  if (iso === key(ayer)) return "Ayer";
  return d.toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short" });
}

function groupConsultorios(consultorios: Consultorio[]): Map<string, Consultorio[]> {
  const map = new Map<string, Consultorio[]>();
  for (const c of consultorios) {
    const sede = c.sucursal_nombre ?? "Sin sucursal";
    if (!map.has(sede)) map.set(sede, []);
    map.get(sede)!.push(c);
  }
  return map;
}

export default function FormElements() {
  const { user } = useAuth();
  const isRoot = user?.role === "root";

  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingTurnos, setLoadingTurnos] = useState(false);
  const [error, setError] = useState("");
  const [listaFiltro, setListaFiltro] = useState<ListaFiltro>("activos");
  const [soloConsultorio, setSoloConsultorio] = useState(true);
  const [pacienteSearch, setPacienteSearch] = useState("");

  const [form, setForm] = useState({
    consultorio_id: "",
    paciente_id: "",
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    prioridad: "normal" as "normal" | "urgencia",
    observaciones: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [createdTurno, setCreatedTurno] = useState<Turno | null>(null);
  const [pacienteParaEnvio, setPacienteParaEnvio] = useState<Paciente | null>(null);
  const [enviando, setEnviando] = useState<"email" | "sms" | null>(null);
  const [enviadoMsg, setEnviadoMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const [turnoACancelar, setTurnoACancelar] = useState<Turno | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [recuperandoId, setRecuperandoId] = useState<string | null>(null);

  const consultoriosAgrupados = useMemo(() => groupConsultorios(consultorios), [consultorios]);

  const selectedPaciente = useMemo(
    () => pacientes.find((p) => p.id === form.paciente_id) ?? null,
    [pacientes, form.paciente_id]
  );

  const filteredPacientes = useMemo(() => {
    const q = pacienteSearch.trim().toLowerCase();
    const list = !q
      ? pacientes
      : pacientes.filter(
          (p) =>
            p.nombre.toLowerCase().includes(q) ||
            p.apellido.toLowerCase().includes(q) ||
            p.dni.toLowerCase().includes(q)
        );
    return list.slice(0, 10);
  }, [pacientes, pacienteSearch]);

  const loadTurnos = useCallback(async () => {
    setLoadingTurnos(true);
    try {
      const params =
        soloConsultorio && form.consultorio_id
          ? { fecha: form.fecha, consultorio_id: form.consultorio_id }
          : { fecha: form.fecha };
      const { turnos: data } = await getTurnos(params);
      setTurnos(
        filterByTenant(data, user?.tenantId, isRoot).sort((a, b) => a.orden - b.orden)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar turnos");
      setTurnos([]);
    } finally {
      setLoadingTurnos(false);
    }
  }, [form.fecha, form.consultorio_id, soloConsultorio, user?.tenantId, isRoot]);

  useEffect(() => {
    Promise.all([getConsultorios(), getPacientes()])
      .then(([c, p]) => {
        const activos = filterByTenant(c.consultorios, user?.tenantId, isRoot).filter(
          (x) => x.activo
        );
        setConsultorios(activos);
        setPacientes(filterByTenant(p.pacientes, user?.tenantId, isRoot));
        if (activos.length === 1) {
          setForm((f) => ({ ...f, consultorio_id: activos[0].id }));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoadingInit(false));
  }, [user?.tenantId, isRoot]);

  useEffect(() => {
    if (!loadingInit) loadTurnos();
  }, [loadingInit, loadTurnos]);

  useTurnosSocket(form.fecha, loadTurnos);

  const stats = useMemo(() => {
    const enCola = turnos.filter((t) => ACTIVOS.has(t.estado)).length;
    const finalizados = turnos.filter((t) => t.estado === "finalizado").length;
    const cancelados = turnos.filter((t) => CANCELADOS.has(t.estado)).length;
    return { enCola, finalizados, cancelados, total: turnos.length };
  }, [turnos]);

  const turnosFiltrados = useMemo(() => {
    switch (listaFiltro) {
      case "activos":
        return turnos.filter((t) => ACTIVOS.has(t.estado));
      case "finalizados":
        return turnos.filter((t) => t.estado === "finalizado");
      case "cancelados":
        return turnos.filter((t) => CANCELADOS.has(t.estado));
      default:
        return turnos;
    }
  }, [turnos, listaFiltro]);

  const selectedConsultorio = consultorios.find((c) => c.id === form.consultorio_id);

  const setFechaRapida = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    setForm((f) => ({ ...f, fecha: d.toISOString().slice(0, 10) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.consultorio_id || !form.paciente_id) {
      setError("Selecciona consultorio y paciente");
      return;
    }
    setSubmitting(true);
    try {
      const consultorio = consultorios.find((c) => c.id === form.consultorio_id);
      const turno = await createTurno({
        consultorio_id: form.consultorio_id,
        paciente_id: form.paciente_id,
        fecha: form.fecha,
        hora: form.hora,
        prioridad: form.prioridad,
        observaciones: form.observaciones.trim() || undefined,
        ...(user?.role === "root" && consultorio ? { tenant_id: consultorio.tenant_id } : {}),
      });
      const paciente = pacientes.find((p) => p.id === form.paciente_id) ?? null;
      setCreatedTurno(turno);
      setPacienteParaEnvio(paciente);
      setEnviadoMsg(null);
      setForm((f) => ({
        ...f,
        paciente_id: "",
        observaciones: "",
        prioridad: "normal",
      }));
      setPacienteSearch("");
      await loadTurnos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear turno");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnviar = async (canal: "email" | "sms") => {
    if (!createdTurno) return;
    setEnviando(canal);
    setEnviadoMsg(null);
    try {
      const result = await enviarTurno(createdTurno.id, canal);
      setEnviadoMsg({ texto: result.mensaje, ok: result.enviado });
    } catch (e) {
      setEnviadoMsg({ texto: e instanceof Error ? e.message : "Error al enviar", ok: false });
    } finally {
      setEnviando(null);
    }
  };

  const cerrarExito = () => {
    setCreatedTurno(null);
    setPacienteParaEnvio(null);
    setEnviadoMsg(null);
  };

  const abrirCancelar = (turno: Turno) => {
    setTurnoACancelar(turno);
    setMotivoCancelacion("");
    setError("");
  };

  const cerrarCancelar = () => {
    if (cancelando) return;
    setTurnoACancelar(null);
    setMotivoCancelacion("");
  };

  const confirmarCancelacion = async () => {
    if (!turnoACancelar) return;
    const motivo = motivoCancelacion.trim();
    if (motivo.length < 3) {
      setError("Indica el motivo de la cancelación (mínimo 3 caracteres).");
      return;
    }
    setCancelando(true);
    setError("");
    try {
      await cancelarTurno(turnoACancelar.id, motivo);
      setTurnoACancelar(null);
      setMotivoCancelacion("");
      await loadTurnos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cancelar turno");
    } finally {
      setCancelando(false);
    }
  };

  const handleRecuperar = async (turno: Turno) => {
    if (!confirm(`¿Recuperar el turno ${turno.numero_turno} y colocarlo al final de la cola?`)) return;
    setRecuperandoId(turno.id);
    setError("");
    try {
      await recuperarTurno(turno.id);
      await loadTurnos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al recuperar turno");
    } finally {
      setRecuperandoId(null);
    }
  };

  if (loadingInit) {
    return (
      <div>
        <PageMeta title="Nuevo turno | Colas Turnos" description="Recepción — asignar turnos" />
        <PageBreadcrumb pageTitle="Nuevo turno" />
        <div className="flex items-center justify-center py-24 text-gray-500">
          <span className="animate-pulse">Cargando consultorios y pacientes…</span>
        </div>
      </div>
    );
  }

  if (user?.role === "medico") {
    return (
      <div>
        <PageMeta title="Nuevo turno | Colas Turnos" description="Dar turno" />
        <PageBreadcrumb pageTitle="Nuevo turno" />
        <ComponentCard title="Acceso restringido">
          <p className="text-gray-600 dark:text-gray-400">
            Solo recepción o administración pueden asignar turnos. Usa{" "}
            <Link to="/vista-medico" className="text-brand-500 hover:underline">
              Vista médico
            </Link>{" "}
            para gestionar la cola.
          </p>
        </ComponentCard>
      </div>
    );
  }

  const filtros: { id: ListaFiltro; label: string; count: number }[] = [
    { id: "activos", label: "En cola", count: stats.enCola },
    { id: "finalizados", label: "Atendidos", count: stats.finalizados },
    { id: "cancelados", label: "Cancelados", count: stats.cancelados },
    { id: "todos", label: "Todos", count: stats.total },
  ];

  return (
    <div className="space-y-6">
      <PageMeta title="Nuevo turno | Colas Turnos" description="Recepción — asignar y consultar turnos" />
      <PageBreadcrumb pageTitle="Nuevo turno" />

      {/* Encabezado con fecha y resumen */}
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-brand-50/80 to-white p-5 dark:border-gray-800 dark:from-brand-500/10 dark:to-gray-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Recepción — turnos del día
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Asigna turnos y consulta el estado de la cola en tiempo real.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFechaRapida(-1)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Ayer
            </button>
            <button
              type="button"
              onClick={() => setFechaRapida(0)}
              className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-500/15 dark:text-brand-400"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setFechaRapida(1)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Mañana
            </button>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "En cola", value: stats.enCola, color: "text-blue-600 dark:text-blue-400" },
            { label: "Atendidos", value: stats.finalizados, color: "text-green-600 dark:text-green-400" },
            { label: "Cancelados", value: stats.cancelados, color: "text-red-600 dark:text-red-400" },
            { label: "Total día", value: stats.total, color: "text-gray-800 dark:text-gray-200" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-gray-100 bg-white/80 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
              <p className={`mt-0.5 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
          role="alert"
        >
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError("")}
          >
            Cerrar
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Formulario */}
        <div className="xl:col-span-2">
          <ComponentCard title="Nuevo turno">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label>Consultorio</Label>
                <select
                  value={form.consultorio_id}
                  onChange={(e) => setForm((f) => ({ ...f, consultorio_id: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="">Selecciona consultorio</option>
                  {Array.from(consultoriosAgrupados.entries()).map(([sede, lista]) => (
                    <optgroup key={sede} label={sede}>
                      {lista.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                          {c.medico_nombre ? ` — ${c.medico_nombre}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {consultorios.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    No hay consultorios. Créalos en Sucursales → Consultorios.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label>Paciente</Label>
                  <Link
                    to="/basic-tables"
                    className="text-xs font-medium text-brand-500 hover:underline"
                  >
                    + Nuevo paciente
                  </Link>
                </div>

                {selectedPaciente ? (
                  <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 dark:border-brand-800 dark:bg-brand-500/10">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {selectedPaciente.apellido}, {selectedPaciente.nombre}
                      </p>
                      <p className="text-xs text-gray-500">DNI {selectedPaciente.dni}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, paciente_id: "" }));
                        setPacienteSearch("");
                      }}
                      className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-300"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={pacienteSearch}
                      onChange={(e) => setPacienteSearch(e.target.value)}
                      placeholder="Buscar por nombre o DNI…"
                      disabled={submitting}
                    />
                    {pacientes.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No hay pacientes registrados.{" "}
                        <Link to="/basic-tables" className="text-brand-500 hover:underline">
                          Crear uno
                        </Link>
                      </p>
                    ) : filteredPacientes.length > 0 ? (
                      <ul className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                        {filteredPacientes.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setForm((f) => ({ ...f, paciente_id: p.id }));
                                setPacienteSearch("");
                              }}
                              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                            >
                              <span className="font-medium text-gray-800 dark:text-gray-200">
                                {p.apellido}, {p.nombre}
                              </span>
                              <span className="text-xs text-gray-500">{p.dni}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : pacienteSearch.trim() ? (
                      <p className="text-xs text-gray-500">Sin resultados para &quot;{pacienteSearch}&quot;</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Hora</Label>
                  <Input
                    type="time"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                    disabled={submitting}
                  />
                </div>
                <div>
                  <Label>Prioridad</Label>
                  <select
                    value={form.prioridad}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        prioridad: e.target.value as "normal" | "urgencia",
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgencia">Urgencia</option>
                  </select>
                </div>
              </div>

              <div>
                <Label>Observaciones (opcional)</Label>
                <Input
                  value={form.observaciones}
                  onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                  placeholder="Ej. control de embarazo, derivación…"
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || pacientes.length === 0 || !form.consultorio_id || !form.paciente_id}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Asignando turno…" : "Asignar turno"}
              </button>
            </form>
          </ComponentCard>

          {createdTurno && pacienteParaEnvio && (
            <div className="mt-4 rounded-2xl border border-success-200 bg-success-50/80 p-5 dark:border-success-800 dark:bg-success-500/10">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-500 text-lg font-bold text-white">
                  {createdTurno.numero_turno}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-success-800 dark:text-success-300">
                    Turno asignado correctamente
                  </p>
                  <p className="mt-1 text-sm text-success-700/90 dark:text-success-400/90">
                    {pacienteParaEnvio.apellido}, {pacienteParaEnvio.nombre} ·{" "}
                    {formatFechaLabel(form.fecha)} {formatHora(createdTurno.hora)}
                    {selectedConsultorio && ` · ${selectedConsultorio.nombre}`}
                  </p>
                  {(pacienteParaEnvio.email || pacienteParaEnvio.telefono) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pacienteParaEnvio.email && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!enviando}
                          onClick={() => handleEnviar("email")}
                        >
                          {enviando === "email" ? "Enviando…" : "Correo"}
                        </Button>
                      )}
                      {pacienteParaEnvio.telefono && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!enviando}
                          onClick={() => handleEnviar("sms")}
                        >
                          {enviando === "sms" ? "Enviando…" : "SMS"}
                        </Button>
                      )}
                    </div>
                  )}
                  {enviadoMsg && (
                    <p
                      className={`mt-2 text-sm ${enviadoMsg.ok ? "text-success-700" : "text-amber-700"}`}
                    >
                      {enviadoMsg.texto}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={cerrarExito}
                    className="mt-3 text-sm font-medium text-success-800 underline dark:text-success-400"
                  >
                    Listo, siguiente turno
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista de turnos */}
        <div className="xl:col-span-3">
          <ComponentCard
            title={`Turnos — ${formatFechaLabel(form.fecha)}`}
            desc={
              selectedConsultorio && soloConsultorio
                ? `${selectedConsultorio.nombre}${selectedConsultorio.sucursal_nombre ? ` · ${selectedConsultorio.sucursal_nombre}` : ""}`
                : "Todos los consultorios"
            }
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {filtros.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setListaFiltro(f.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      listaFiltro === f.id
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                    }`}
                  >
                    {f.label}
                    <span className="ml-1 opacity-80">({f.count})</span>
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={soloConsultorio}
                  onChange={(e) => setSoloConsultorio(e.target.checked)}
                  disabled={!form.consultorio_id}
                  className="rounded border-gray-300"
                />
                Solo consultorio seleccionado
              </label>
            </div>

            {loadingTurnos ? (
              <p className="py-12 text-center text-sm text-gray-500">Actualizando cola…</p>
            ) : turnosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <span className="text-2xl text-gray-400">—</span>
                </div>
                <p className="font-medium text-gray-700 dark:text-gray-300">
                  {listaFiltro === "activos"
                    ? "No hay pacientes en cola"
                    : "No hay turnos en esta categoría"}
                </p>
                <p className="mt-1 max-w-xs text-sm text-gray-500">
                  {stats.total === 0
                    ? "Aún no se han registrado turnos para esta fecha."
                    : "Prueba otro filtro o cambia la fecha."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell isHeader>#</TableCell>
                      <TableCell isHeader>Paciente</TableCell>
                      <TableCell isHeader>Hora</TableCell>
                      <TableCell isHeader>Consultorio</TableCell>
                      <TableCell isHeader>Estado</TableCell>
                      <TableCell isHeader className="text-right">Acciones</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {turnosFiltrados.map((t) => (
                      <TableRow
                        key={t.id}
                        className={
                          t.id === createdTurno?.id
                            ? "bg-success-50/50 dark:bg-success-500/5"
                            : undefined
                        }
                      >
                        <TableCell>
                          <span className="font-mono text-sm font-bold text-brand-600 dark:text-brand-400">
                            {t.numero_turno}
                          </span>
                          {t.prioridad === "urgencia" && (
                            <Badge color="error" size="sm" variant="light">
                              URG
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-gray-800 dark:text-gray-200">
                            {t.paciente_apellido}, {t.paciente_nombre}
                          </p>
                          {t.paciente_dni && (
                            <p className="text-xs text-gray-500">DNI {t.paciente_dni}</p>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums text-gray-600 dark:text-gray-400">
                          {formatHora(t.hora)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                          {t.consultorio_nombre ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge
                              color={ESTADO_COLOR[t.estado] ?? "light"}
                              size="sm"
                              variant="light"
                            >
                              {ESTADO_LABEL[t.estado] ?? t.estado}
                            </Badge>
                            {t.motivo_cancelacion && (
                              <p className="max-w-[200px] text-xs text-gray-500 dark:text-gray-400" title={t.motivo_cancelacion}>
                                {t.motivo_cancelacion}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {CANCELABLES.has(t.estado) && (
                            <button
                              type="button"
                              onClick={() => abrirCancelar(t)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              Cancelar
                            </button>
                          )}
                          {t.estado === "cancelado" && (
                            <button
                              type="button"
                              disabled={recuperandoId === t.id}
                              onClick={() => void handleRecuperar(t)}
                              className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
                            >
                              {recuperandoId === t.id ? "Recuperando…" : "Recuperar a cola"}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              La cola se actualiza automáticamente cuando hay cambios en recepción o consultorio.
            </p>
          </ComponentCard>
        </div>
      </div>

      <Modal isOpen={!!turnoACancelar} onClose={cerrarCancelar} className="max-w-md">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Cancelar turno {turnoACancelar?.numero_turno}
          </h2>
          {turnoACancelar && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {turnoACancelar.paciente_apellido}, {turnoACancelar.paciente_nombre}
              {turnoACancelar.consultorio_nombre ? ` · ${turnoACancelar.consultorio_nombre}` : ""}
            </p>
          )}
          <div className="mt-4">
            <Label>
              Motivo de cancelación <span className="text-error-500">*</span>
            </Label>
            <TextArea
              rows={4}
              value={motivoCancelacion}
              onChange={setMotivoCancelacion}
              placeholder="Ej. el paciente solicitó reprogramar, error en el registro, cambió de consultorio…"
              disabled={cancelando}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Obligatorio. Podrás recuperar el turno después y lo ubicará al final de la cola.
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={cerrarCancelar} disabled={cancelando}>
              Volver
            </Button>
            <button
              type="button"
              disabled={cancelando || motivoCancelacion.trim().length < 3}
              onClick={() => void confirmarCancelacion()}
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelando ? "Cancelando…" : "Confirmar cancelación"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
