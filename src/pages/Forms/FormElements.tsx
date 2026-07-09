import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
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
  validarAfiliacionIgss,
  type AfiliacionIgssResult,
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
import TrasladarTurnoModal from "../../components/turnos/TrasladarTurnoModal";
import { PausarTurnoModal, ReanudarTurnoModal } from "../../components/turnos/TurnoPausaModals";
import MrzAfiliadoPanel from "../../components/recepcion/MrzAfiliadoPanel";
import IgssConsultaLoader, { conEsperaIgss } from "../../components/recepcion/IgssConsultaLoader";
import TextArea from "../../components/form/input/TextArea";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "En espera",
  llamado: "Llamado",
  en_atencion: "En atención",
  en_pausa: "En pausa",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  no_show: "No asistió",
};

const ESTADO_COLOR: Record<string, "primary" | "success" | "warning" | "error" | "info" | "light"> = {
  pendiente: "info",
  llamado: "warning",
  en_atencion: "primary",
  en_pausa: "warning",
  finalizado: "success",
  cancelado: "error",
  no_show: "light",
};

type ListaFiltro = "activos" | "finalizados" | "cancelados" | "todos";

const ACTIVOS = new Set(["pendiente", "llamado", "en_atencion", "en_pausa"]);
const CANCELABLES = new Set(["pendiente", "llamado", "en_atencion", "en_pausa"]);
const PAUSABLES = new Set(["pendiente", "llamado", "en_atencion"]);
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

type PacienteTab = "mrz" | "lista";

function FormSection({
  step,
  title,
  description,
  children,
  kiosk,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  kiosk?: boolean;
}) {
  return (
    <section
      className={
        kiosk
          ? "overflow-hidden rounded-2xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-white/[0.03]"
          : "overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-white/[0.02]"
      }
    >
      <header
        className={`flex items-center gap-3 border-b border-gray-200/80 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${
          kiosk ? "px-5 py-4" : "px-4 py-3"
        }`}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-white ${
            kiosk ? "h-10 w-10 text-base" : "h-7 w-7 text-xs"
          }`}
        >
          {step}
        </span>
        <div className="min-w-0">
          <h3 className={`font-semibold text-gray-900 dark:text-white ${kiosk ? "text-lg" : "text-sm"}`}>
            {title}
          </h3>
          {description && (
            <p className={`text-gray-500 dark:text-gray-400 ${kiosk ? "text-sm" : "text-xs"}`}>
              {description}
            </p>
          )}
        </div>
      </header>
      <div className={kiosk ? "p-5" : "p-4"}>{children}</div>
    </section>
  );
}

function StepCheck({ done, label, kiosk }: { done: boolean; label: string; kiosk?: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 ${kiosk ? "text-base" : "text-xs"} ${
        done ? "text-success-700 dark:text-success-400" : "text-gray-400"
      }`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
          kiosk ? "h-6 w-6 text-xs" : "h-4 w-4 text-[10px]"
        } ${done ? "bg-success-500 text-white" : "border border-gray-300 dark:border-gray-600"}`}
      >
        {done ? "✓" : ""}
      </span>
      {label}
    </li>
  );
}

function getSelectClass(kiosk: boolean): string {
  return kiosk
    ? "h-14 w-full rounded-xl border-2 border-gray-300 bg-white px-4 text-lg shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
    : "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
}

type KioskTab = "asignar" | "cola";

export default function FormElements({ kiosk = false }: { kiosk?: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
  const [turnoATrasladar, setTurnoATrasladar] = useState<Turno | null>(null);
  const [turnoAPausar, setTurnoAPausar] = useState<Turno | null>(null);
  const [turnoAReanudar, setTurnoAReanudar] = useState<Turno | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [recuperandoId, setRecuperandoId] = useState<string | null>(null);
  const [afiliacion, setAfiliacion] = useState<AfiliacionIgssResult | null>(null);
  const [validandoPacienteId, setValidandoPacienteId] = useState<string | null>(null);
  const [pacienteTab, setPacienteTab] = useState<PacienteTab>(kiosk ? "mrz" : "lista");
  const [kioskTab, setKioskTab] = useState<KioskTab>("asignar");
  const [reloj, setReloj] = useState(() =>
    new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })
  );

  const selectClass = getSelectClass(kiosk);

  useEffect(() => {
    if (!kiosk) return;
    const id = setInterval(() => {
      setReloj(new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" }));
    }, 30_000);
    return () => clearInterval(id);
  }, [kiosk]);

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
    return list;
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

  const pacienteListo = !!form.paciente_id && !!afiliacion?.elegible;
  const faltaConsultorio = !form.consultorio_id && consultorios.length > 0;

  const puedeAsignar =
    !!form.consultorio_id && !!form.paciente_id && !!afiliacion?.elegible && !submitting;

  const validandoPaciente = pacientes.find((p) => p.id === validandoPacienteId) ?? null;

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
    if (!afiliacion?.elegible) {
      setError("Valida con el lector MRZ o selecciona un paciente para verificar que este al dia en IGSS.");
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
      setAfiliacion(null);
      if (kiosk) setKioskTab("cola");
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
    if (kiosk) setKioskTab("asignar");
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

  const handlePacienteMrz = (p: Paciente, aff: AfiliacionIgssResult) => {
    setPacientes((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setForm((f) => ({ ...f, paciente_id: p.id }));
    setAfiliacion(aff);
    setPacienteSearch("");
  };

  const limpiarPaciente = () => {
    setForm((f) => ({ ...f, paciente_id: "" }));
    setAfiliacion(null);
    setPacienteSearch("");
  };

  const seleccionarPacienteManual = async (p: Paciente) => {
    setValidandoPacienteId(p.id);
    setError("");
    try {
      const resultado = await conEsperaIgss(
        validarAfiliacionIgss({
          cui: p.dni.replace(/\D/g, "") || p.dni,
          nombre: p.nombre,
          apellido: p.apellido,
        })
      );
      setAfiliacion(resultado);
      if (!resultado.elegible) {
        setError(resultado.mensaje);
        return;
      }
      setForm((f) => ({ ...f, paciente_id: p.id }));
      setPacienteSearch("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al validar afiliación");
    } finally {
      setValidandoPacienteId(null);
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
      <div className={kiosk ? "flex h-full items-center justify-center" : ""}>
        <PageMeta title="Nuevo turno | Colas Turnos" description="Recepción — asignar turnos" />
        {!kiosk && <PageBreadcrumb pageTitle="Nuevo turno" />}
        <div className={`flex items-center justify-center text-gray-500 ${kiosk ? "text-xl" : "py-24"}`}>
          <span className="animate-pulse">Cargando consultorios y pacientes…</span>
        </div>
      </div>
    );
  }

  if (user?.role === "medico") {
    return (
      <div className={kiosk ? "flex h-full flex-col p-8" : ""}>
        <PageMeta title="Nuevo turno | Colas Turnos" description="Dar turno" />
        {!kiosk && <PageBreadcrumb pageTitle="Nuevo turno" />}
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
    <div className={kiosk ? "flex h-full flex-col" : "space-y-5"}>
      <PageMeta title="Nuevo turno | Colas Turnos" description="Recepción — asignar y consultar turnos" />
      {!kiosk && <PageBreadcrumb pageTitle="Nuevo turno" />}

      {kiosk && (
        <header className="shrink-0 border-b border-gray-200 bg-brand-600 px-6 py-5 text-white dark:border-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-brand-100">Recepción IGSS</p>
              <h1 className="mt-1 text-3xl font-bold">Nuevo turno</h1>
              <p className="mt-1 text-base text-brand-100">
                {formatFechaLabel(form.fecha)}
                {selectedConsultorio ? ` · ${selectedConsultorio.nombre}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <p className="font-mono text-4xl font-bold tabular-nums">{reloj}</p>
              {user?.fullName && <p className="text-sm text-brand-100">{user.fullName}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Link
                  to="/"
                  className="rounded-xl bg-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/30"
                >
                  Menú principal
                </Link>
                <Link
                  to="/panel-llamados"
                  className="rounded-xl bg-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/30"
                >
                  Panel llamados
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate("/signin", { replace: true });
                  }}
                  className="rounded-xl border border-white/40 bg-transparent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {(
              [
                { id: "asignar" as const, label: "Asignar turno" },
                { id: "cola" as const, label: `Cola (${stats.enCola})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setKioskTab(tab.id)}
                className={`flex-1 rounded-xl py-3.5 text-lg font-semibold transition ${
                  kioskTab === tab.id
                    ? "bg-white text-brand-700 shadow-md"
                    : "bg-brand-500/40 text-white hover:bg-brand-500/60"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-3">
            {[
              { label: "En cola", value: stats.enCola },
              { label: "Atendidos", value: stats.finalizados },
              { label: "Cancelados", value: stats.cancelados },
            ].map((s) => (
              <div
                key={s.label}
                className="flex flex-1 items-center justify-between rounded-lg bg-white/15 px-3 py-2"
              >
                <span className="text-sm text-brand-100">{s.label}</span>
                <span className="text-xl font-bold tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        </header>
      )}

      {!kiosk && (
      /* Barra superior compacta — escritorio */
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Recepción</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatFechaLabel(form.fecha)}
            {selectedConsultorio ? ` · ${selectedConsultorio.nombre}` : " · Sin consultorio"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "En cola", value: stats.enCola, active: "text-blue-600 dark:text-blue-400" },
            { label: "Atendidos", value: stats.finalizados, active: "text-green-600 dark:text-green-400" },
            { label: "Cancelados", value: stats.cancelados, active: "text-red-500 dark:text-red-400" },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-900/50"
            >
              <span className="text-xs text-gray-500">{s.label}</span>
              <span className={`text-sm font-bold tabular-nums ${s.active}`}>{s.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: "Ayer", offset: -1 },
            { label: "Hoy", offset: 0, primary: true },
            { label: "Mañana", offset: 1 },
          ].map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setFechaRapida(d.offset)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                d.primary
                  ? "bg-brand-500 font-medium text-white hover:bg-brand-600"
                  : "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {d.label}
            </button>
          ))}
          <input
            type="date"
            value={form.fecha}
            onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>
      </div>
      )}

      <div className={kiosk ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}>
      <div className={`${kiosk ? "flex-1 overflow-y-auto overscroll-contain px-5 py-4" : ""} space-y-5`}>
      {error && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400 ${
            kiosk ? "text-lg" : "text-sm"
          }`}
          role="alert"
        >
          <span>{error}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setError("")}>
            Cerrar
          </button>
        </div>
      )}

      {createdTurno && pacienteParaEnvio && (
        <div className={`rounded-2xl border border-success-200 bg-success-50/90 dark:border-success-800 dark:bg-success-500/10 ${kiosk ? "p-6" : "p-4"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`flex shrink-0 items-center justify-center rounded-xl bg-success-500 font-bold text-white ${kiosk ? "h-20 w-20 text-4xl" : "h-12 w-12 text-xl"}`}>
                {createdTurno.numero_turno}
              </span>
              <div>
                <p className={`font-semibold text-success-800 dark:text-success-300 ${kiosk ? "text-2xl" : ""}`}>
                  Turno asignado
                </p>
                <p className={`mt-0.5 text-success-700/90 dark:text-success-400/90 ${kiosk ? "text-lg" : "text-sm"}`}>
                  {pacienteParaEnvio.apellido}, {pacienteParaEnvio.nombre} · {formatHora(createdTurno.hora)}
                  {selectedConsultorio && ` · ${selectedConsultorio.nombre}`}
                </p>
                {(pacienteParaEnvio.email || pacienteParaEnvio.telefono) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pacienteParaEnvio.email && (
                      <Button size="sm" variant="outline" disabled={!!enviando} onClick={() => handleEnviar("email")}>
                        {enviando === "email" ? "Enviando…" : "Correo"}
                      </Button>
                    )}
                    {pacienteParaEnvio.telefono && (
                      <Button size="sm" variant="outline" disabled={!!enviando} onClick={() => handleEnviar("sms")}>
                        {enviando === "sms" ? "Enviando…" : "SMS"}
                      </Button>
                    )}
                  </div>
                )}
                {enviadoMsg && (
                  <p className={`mt-2 text-sm ${enviadoMsg.ok ? "text-success-700" : "text-amber-700"}`}>
                    {enviadoMsg.texto}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={cerrarExito}
              className={`font-medium text-success-800 underline dark:text-success-400 ${kiosk ? "text-lg" : "text-sm"}`}
            >
              {kiosk ? "Asignar otro turno" : "Siguiente turno"}
            </button>
          </div>
        </div>
      )}

      <div className={kiosk ? "space-y-4" : "grid gap-5 xl:grid-cols-12"}>
        {/* Panel izquierdo — asignación */}
        {(!kiosk || kioskTab === "asignar") && (
        <div className={kiosk ? "" : "xl:col-span-5 xl:sticky xl:top-4 xl:self-start"}>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            {!kiosk && (
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Asignar turno</h2>
              <p className="mt-0.5 text-xs text-gray-500">Completa los 3 pasos en orden</p>
            </div>
            )}

            <form onSubmit={handleSubmit} className={`space-y-4 ${kiosk ? "p-1" : "p-4"}`}>
              <FormSection kiosk={kiosk} step={1} title="Destino" description="Consultorio y horario del turno">
                <div className="space-y-3">
                  {faltaConsultorio && pacienteListo && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-100">
                      <span className="font-medium">Falta el consultorio.</span>{" "}
                      {selectedPaciente
                        ? `${selectedPaciente.apellido}, ${selectedPaciente.nombre} ya fue validado — elige el consultorio para asignar el turno.`
                        : "El paciente ya fue validado — elige el consultorio para asignar el turno."}
                    </div>
                  )}
                  <div>
                    <Label>Consultorio</Label>
                    <select
                      value={form.consultorio_id}
                      onChange={(e) => setForm((f) => ({ ...f, consultorio_id: e.target.value }))}
                      className={`${selectClass}${
                        faltaConsultorio && pacienteListo
                          ? " border-amber-400 ring-1 ring-amber-300 dark:border-amber-600 dark:ring-amber-700"
                          : ""
                      }`}
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
                        No hay consultorios.{" "}
                        <Link to="/consultorios" className="underline">
                          Crear en Consultorios
                        </Link>
                      </p>
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
                        className={selectClass}
                      >
                        <option value="normal">Normal</option>
                        <option value="urgencia">Urgencia</option>
                      </select>
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection kiosk={kiosk} step={2} title="Paciente" description="Escanear documento o buscar en el registro">
                {faltaConsultorio && !pacienteListo && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-100">
                    <span className="font-medium">Selecciona el consultorio primero</span> (paso 1).
                    También puedes escanear el DPI y elegir consultorio después.
                  </div>
                )}

                {selectedPaciente && afiliacion?.elegible ? (
                  <div className="mb-4 flex items-center justify-between rounded-xl border border-success-200 bg-success-50/60 px-4 py-3 dark:border-success-800 dark:bg-success-500/10">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color="success" size="sm" variant="light">
                          Paciente al Dia
                        </Badge>
                        {afiliacion.fuente === "mock" && (
                          <Badge color="light" size="sm" variant="light">
                            Simulación
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate font-medium text-gray-900 dark:text-white">
                        {selectedPaciente.apellido}, {selectedPaciente.nombre}
                      </p>
                      <p className="text-xs text-gray-500">
                        CUI {selectedPaciente.dni}
                        {afiliacion.numero_afiliacion && ` · ${afiliacion.numero_afiliacion}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={limpiarPaciente}
                      className="ml-2 shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-300"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : null}

                {pacienteListo && faltaConsultorio && (
                  <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-100">
                    Selecciona el <span className="font-medium">consultorio en el paso 1</span> para poder
                    asignar el turno.
                  </div>
                )}

                <div className={`mb-3 flex rounded-lg border border-gray-200 bg-gray-100/80 p-1 dark:border-gray-700 dark:bg-gray-900/50 ${kiosk ? "p-1.5" : ""}`}>
                  {(
                    [
                      { id: "mrz" as const, label: "Escanear MRZ" },
                      { id: "lista" as const, label: "Buscar paciente" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPacienteTab(tab.id)}
                      className={`flex-1 rounded-md font-medium transition ${
                        kiosk ? "px-4 py-3.5 text-base" : "px-3 py-2 text-xs"
                      } ${
                        pacienteTab === tab.id
                          ? "bg-white text-brand-700 shadow-sm dark:bg-gray-800 dark:text-brand-400"
                          : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {validandoPacienteId ? (
                  <IgssConsultaLoader
                    compact
                    pacienteNombre={
                      validandoPaciente
                        ? `${validandoPaciente.apellido}, ${validandoPaciente.nombre}`
                        : undefined
                    }
                  />
                ) : pacienteTab === "mrz" ? (
                  <MrzAfiliadoPanel
                    key="mrz-scan"
                    embedded
                    disabled={submitting}
                    tenantId={selectedConsultorio?.tenant_id}
                    showInlineResult={false}
                    onPacienteSelected={handlePacienteMrz}
                    onClear={limpiarPaciente}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={pacienteSearch}
                        onChange={(e) => setPacienteSearch(e.target.value)}
                        placeholder="Nombre o CUI…"
                        disabled={submitting}
                      />
                      <Link
                        to="/basic-tables"
                        className="shrink-0 text-xs font-medium text-brand-500 hover:underline"
                      >
                        + Nuevo
                      </Link>
                    </div>
                    {pacientes.length === 0 ? (
                      <p className="py-6 text-center text-xs text-gray-500">
                        Sin pacientes registrados.{" "}
                        <Link to="/basic-tables" className="text-brand-500 hover:underline">
                          Crear uno
                        </Link>
                      </p>
                    ) : filteredPacientes.length > 0 ? (
                      <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                        {filteredPacientes.map((p) => {
                          const seleccionado = form.paciente_id === p.id && afiliacion?.elegible;
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => void seleccionarPacienteManual(p)}
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-white/5 ${
                                  seleccionado ? "bg-brand-50/50 dark:bg-brand-500/10" : ""
                                }`}
                              >
                                <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-200">
                                  {p.apellido}, {p.nombre}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-gray-400">{p.dni}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="py-4 text-center text-xs text-gray-500">
                        Sin resultados para &quot;{pacienteSearch}&quot;
                      </p>
                    )}
                  </div>
                )}
              </FormSection>

              <FormSection kiosk={kiosk} step={3} title="Detalles" description="Opcional">
                <div>
                  <Label>Observaciones</Label>
                  <Input
                    value={form.observaciones}
                    onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                    placeholder="Ej. control, derivación…"
                    disabled={submitting}
                  />
                </div>
              </FormSection>

              <div className={`rounded-xl border border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/30 ${kiosk ? "p-5" : "p-4"}`}>
                <ul className={`mb-4 space-y-2 ${kiosk ? "space-y-2.5" : "space-y-1.5"}`}>
                  <StepCheck kiosk={kiosk} done={!!form.consultorio_id} label="Consultorio seleccionado" />
                  <StepCheck
                    kiosk={kiosk}
                    done={!!form.paciente_id && !!afiliacion?.elegible}
                    label="Paciente validado (al dia)"
                  />
                </ul>
                <button
                  type="submit"
                  disabled={!puedeAsignar}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45 ${
                    kiosk ? "px-6 py-5 text-xl" : "px-5 py-3.5 text-sm"
                  }`}
                >
                  {submitting ? "Asignando turno…" : "Asignar turno a la cola"}
                </button>
              </div>
            </form>
          </div>
        </div>
        )}

        {/* Panel derecho — cola */}
        {(!kiosk || kioskTab === "cola") && (
        <div className={kiosk ? "" : "xl:col-span-7"}>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className={`flex flex-col gap-3 border-b border-gray-100 dark:border-gray-800 ${kiosk ? "px-5 py-4" : "px-5 py-4 sm:flex-row sm:items-center sm:justify-between"}`}>
              <div>
                <h2 className={`font-semibold text-gray-900 dark:text-white ${kiosk ? "text-xl" : "text-base"}`}>
                  Cola del dia
                </h2>
                <p className={`text-gray-500 ${kiosk ? "text-sm" : "text-xs"}`}>
                  {soloConsultorio && selectedConsultorio
                    ? `${selectedConsultorio.nombre}${selectedConsultorio.sucursal_nombre ? ` · ${selectedConsultorio.sucursal_nombre}` : ""}`
                    : "Todos los consultorios"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {kiosk && (
                  <>
                    {[
                      { label: "Ayer", offset: -1 },
                      { label: "Hoy", offset: 0 },
                      { label: "Mañana", offset: 1 },
                    ].map((d) => (
                      <button
                        key={d.label}
                        type="button"
                        onClick={() => setFechaRapida(d.offset)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
                      >
                        {d.label}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                      className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  </>
                )}
                <label className={`flex cursor-pointer items-center gap-2 text-gray-600 dark:text-gray-400 ${kiosk ? "text-sm" : "text-xs"}`}>
                  <input
                    type="checkbox"
                    checked={soloConsultorio}
                    onChange={(e) => setSoloConsultorio(e.target.checked)}
                    disabled={!form.consultorio_id}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Solo consultorio seleccionado
                </label>
              </div>
            </div>

            <div className={`flex flex-wrap gap-2 border-b border-gray-100 dark:border-gray-800 ${kiosk ? "px-5 py-4" : "gap-1.5 px-4 py-3"}`}>
              {filtros.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setListaFiltro(f.id)}
                  className={`rounded-xl font-medium transition ${
                    kiosk ? "px-4 py-2.5 text-base" : "rounded-lg px-3 py-1.5 text-xs"
                  } ${
                    listaFiltro === f.id
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 opacity-80">({f.count})</span>
                </button>
              ))}
            </div>

            <div className="p-4">
              {loadingTurnos ? (
                <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-500">
                  <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500" />
                  Actualizando cola…
                </div>
              ) : turnosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                    <svg className="h-7 w-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {listaFiltro === "activos" ? "Cola vacía" : "Sin turnos en este filtro"}
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-gray-500">
                    {stats.total === 0
                      ? "Aún no hay turnos para esta fecha."
                      : "Prueba otro filtro o cambia la fecha."}
                  </p>
                </div>
              ) : kiosk ? (
                <div className="space-y-3">
                  {turnosFiltrados.map((t) => (
                    <div
                      key={t.id}
                      className={`rounded-2xl border-2 p-5 ${
                        t.id === createdTurno?.id
                          ? "border-success-300 bg-success-50/60 dark:border-success-700 dark:bg-success-500/10"
                          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-5xl font-black leading-none text-brand-600 dark:text-brand-400">
                            {t.numero_turno}
                          </span>
                          {t.prioridad === "urgencia" && (
                            <Badge color="error" size="sm" variant="light">
                              URG
                            </Badge>
                          )}
                        </div>
                        <Badge color={ESTADO_COLOR[t.estado] ?? "light"} size="sm" variant="light">
                          {ESTADO_LABEL[t.estado] ?? t.estado}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">
                        {t.paciente_apellido}, {t.paciente_nombre}
                      </p>
                      <p className="mt-1 text-base text-gray-500">
                        {formatHora(t.hora)}
                        {t.consultorio_nombre ? ` · ${t.consultorio_nombre}` : ""}
                        {t.paciente_dni ? ` · CUI ${t.paciente_dni}` : ""}
                      </p>
                      {t.motivo_cancelacion && (
                        <p className="mt-2 text-sm text-gray-400">{t.motivo_cancelacion}</p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        {CANCELABLES.has(t.estado) && (
                          <>
                            <button
                              type="button"
                              onClick={() => setTurnoATrasladar(t)}
                              className="rounded-lg bg-brand-50 px-4 py-2.5 text-base font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                            >
                              Trasladar
                            </button>
                            {PAUSABLES.has(t.estado) && (
                              <button
                                type="button"
                                onClick={() => setTurnoAPausar(t)}
                                className="rounded-lg bg-amber-50 px-4 py-2.5 text-base font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400"
                              >
                                Pausar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => abrirCancelar(t)}
                              className="rounded-lg bg-red-50 px-4 py-2.5 text-base font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400"
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                        {t.estado === "en_pausa" && (
                          <button
                            type="button"
                            onClick={() => setTurnoAReanudar(t)}
                            className="rounded-lg bg-amber-50 px-4 py-2.5 text-base font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400"
                          >
                            Reanudar
                          </button>
                        )}
                        {t.estado === "cancelado" && (
                          <button
                            type="button"
                            disabled={recuperandoId === t.id}
                            onClick={() => void handleRecuperar(t)}
                            className="rounded-lg bg-brand-50 px-4 py-2.5 text-base font-medium text-brand-700 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-400"
                          >
                            {recuperandoId === t.id ? "Recuperando…" : "Recuperar"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableCell isHeader className="w-16">#</TableCell>
                        <TableCell isHeader>Paciente</TableCell>
                        <TableCell isHeader className="w-20">Hora</TableCell>
                        <TableCell isHeader>Consultorio</TableCell>
                        <TableCell isHeader className="w-28">Estado</TableCell>
                        <TableCell isHeader className="w-24 text-right">Acciones</TableCell>
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
                              <p className="text-xs text-gray-500">{t.paciente_dni}</p>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums text-gray-600 dark:text-gray-400">
                            {formatHora(t.hora)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                            {t.consultorio_nombre ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              color={ESTADO_COLOR[t.estado] ?? "light"}
                              size="sm"
                              variant="light"
                            >
                              {ESTADO_LABEL[t.estado] ?? t.estado}
                            </Badge>
                            {t.motivo_cancelacion && (
                              <p
                                className="mt-0.5 max-w-[140px] truncate text-[10px] text-gray-400"
                                title={t.motivo_cancelacion}
                              >
                                {t.motivo_cancelacion}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-0.5">
                            {CANCELABLES.has(t.estado) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setTurnoATrasladar(t)}
                                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                                >
                                  Trasladar
                                </button>
                                {PAUSABLES.has(t.estado) && (
                                  <button
                                    type="button"
                                    onClick={() => setTurnoAPausar(t)}
                                    className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                                  >
                                    Pausar
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => abrirCancelar(t)}
                                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                                >
                                  Cancelar
                                </button>
                              </>
                            )}
                            {t.estado === "en_pausa" && (
                              <button
                                type="button"
                                onClick={() => setTurnoAReanudar(t)}
                                className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                              >
                                Reanudar
                              </button>
                            )}
                              {t.estado === "cancelado" && (
                                <button
                                  type="button"
                                  disabled={recuperandoId === t.id}
                                  onClick={() => void handleRecuperar(t)}
                                  className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
                                >
                                  {recuperandoId === t.id ? "…" : "Recuperar"}
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className={`mt-3 text-center text-gray-400 ${kiosk ? "text-sm" : "text-[11px]"}`}>
                Actualización automática en tiempo real
              </p>
            </div>
          </div>
        </div>
        )}
      </div>
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
              Obligatorio. Los turnos en pausa conservan su lugar; al cancelar podras recuperarlos al final de la cola.
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

      <TrasladarTurnoModal
        turno={turnoATrasladar}
        fecha={form.fecha}
        onClose={() => setTurnoATrasladar(null)}
        onSuccess={() => void loadTurnos()}
      />

      <PausarTurnoModal
        turno={turnoAPausar}
        onClose={() => setTurnoAPausar(null)}
        onSuccess={() => void loadTurnos()}
      />

      <ReanudarTurnoModal
        turno={turnoAReanudar}
        onClose={() => setTurnoAReanudar(null)}
        onSuccess={() => void loadTurnos()}
      />
    </div>
  );
}
