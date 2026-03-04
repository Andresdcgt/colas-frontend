import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import {
  getConsultorios,
  getPacientes,
  createTurno,
  enviarTurno,
  type Consultorio,
  type Paciente,
  type Turno,
} from "../../lib/api";

export default function FormElements() {
  const { user } = useAuth();
  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    consultorio_id: "",
    paciente_id: "",
    fecha: new Date().toISOString().slice(0, 10),
    hora: "09:00",
    prioridad: "normal" as "normal" | "urgencia",
    observaciones: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [createdTurno, setCreatedTurno] = useState<Turno | null>(null);
  const [pacienteParaEnvio, setPacienteParaEnvio] = useState<Paciente | null>(null);
  const [enviando, setEnviando] = useState<"email" | "sms" | null>(null);
  const [enviadoMsg, setEnviadoMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  useEffect(() => {
    Promise.all([getConsultorios(), getPacientes()])
      .then(([c, p]) => {
        setConsultorios(c.consultorios.filter((x) => x.activo));
        setPacientes(p.pacientes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.consultorio_id || !form.paciente_id) {
      setError("Selecciona consultorio y paciente");
      return;
    }
    setSubmitting(true);
    try {
      const consultorio = consultorios.find((c) => c.id === form.consultorio_id);
      const body = {
        consultorio_id: form.consultorio_id,
        paciente_id: form.paciente_id,
        fecha: form.fecha,
        hora: form.hora,
        prioridad: form.prioridad,
        observaciones: form.observaciones.trim() || undefined,
        ...(user?.role === "root" && consultorio ? { tenant_id: consultorio.tenant_id } : {}),
      };
      const turno = await createTurno(body);
      const paciente = pacientes.find((p) => p.id === form.paciente_id) ?? null;
      setSuccess(`Turno ${turno.numero_turno} creado.`);
      setCreatedTurno(turno);
      setPacienteParaEnvio(paciente);
      setEnviadoMsg(null);
      setForm((f) => ({
        ...f,
        paciente_id: "",
        observaciones: "",
      }));
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

  const selectedPaciente = form.paciente_id ? pacientes.find((p) => p.id === form.paciente_id) : null;

  if (loading) {
    return (
      <div>
        <PageMeta title="Nuevo turno | Colas Turnos" description="Dar turno a un paciente" />
        <PageBreadcrumb pageTitle="Nuevo turno" />
        <p className="text-gray-500">Cargando consultorios y pacientes…</p>
      </div>
    );
  }

  if (user?.role === "medico") {
    return (
      <div>
        <PageMeta title="Nuevo turno | Colas Turnos" description="Dar turno" />
        <PageBreadcrumb pageTitle="Nuevo turno" />
        <ComponentCard title="Nuevo turno">
          <p className="text-gray-600 dark:text-gray-400">
            Solo recepción o administración pueden asignar nuevos turnos. Usa <strong>Vista médico</strong> para gestionar la cola de atención.
          </p>
        </ComponentCard>
      </div>
    );
  }

  return (
    <div>
      <PageMeta
        title="Nuevo turno | Colas Turnos"
        description="Dar turno a un paciente (Recepción)"
      />
      <PageBreadcrumb pageTitle="Nuevo turno" />
      <div className="max-w-xl space-y-6">
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 text-sm text-green-700 bg-green-50 rounded-lg dark:bg-green-900/20 dark:text-green-400">
            {success}
          </div>
        )}
        <ComponentCard title="Datos del turno">
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            <strong>Consultorio</strong> = sala de atención (ej. &quot;Consultorio 1&quot;, &quot;Box Dr. Pérez&quot;) dentro de una <strong>sucursal</strong> de la clínica. No es la clínica en sí: primero existe la <strong>clínica</strong> (tenant), luego sus <strong>sucursales</strong> (sedes) y dentro de cada una, los <strong>consultorios</strong> donde se atiende.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Consultorio (sala de atención)</Label>
              <select
                value={form.consultorio_id}
                onChange={(e) => setForm((f) => ({ ...f, consultorio_id: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                required
              >
                <option value="">Selecciona consultorio</option>
                {consultorios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.sucursal_nombre ? ` — ${c.sucursal_nombre}` : ""}
                    {c.medico_nombre ? ` (${c.medico_nombre})` : ""}
                  </option>
                ))}
              </select>
              {consultorios.length === 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  No hay consultorios cargados. Hay que crear antes: 1) una clínica (desde Clínicas), 2) una sucursal y 3) un consultorio de esa sucursal. Por ahora eso se hace por API o con un script de datos de prueba.
                </p>
              )}
            </div>
            <div>
              <Label>Paciente</Label>
              <select
                value={form.paciente_id}
                onChange={(e) => setForm((f) => ({ ...f, paciente_id: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                required
              >
                <option value="">Selecciona paciente</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.apellido}, {p.nombre} — DNI {p.dni}
                  </option>
                ))}
              </select>
              {pacientes.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  No hay pacientes. Crea uno en la página Pacientes.
                </p>
              )}
              {selectedPaciente && (selectedPaciente.email || selectedPaciente.telefono) && (
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Contacto: {selectedPaciente.email && selectedPaciente.telefono
                    ? `${selectedPaciente.email} · ${selectedPaciente.telefono}`
                    : selectedPaciente.email || selectedPaciente.telefono}
                  {" — "}
                  Podrás enviar el turno por correo o mensaje al crearlo.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                  disabled={submitting}
                  required
                />
              </div>
              <div>
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={form.hora}
                  onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                  disabled={submitting}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Prioridad</Label>
              <select
                value={form.prioridad}
                onChange={(e) =>
                  setForm((f) => ({ ...f, prioridad: e.target.value as "normal" | "urgencia" }))
                }
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="normal">Normal</option>
                <option value="urgencia">Urgencia</option>
              </select>
            </div>
            <div>
              <Label>Observaciones (opcional)</Label>
              <Input
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                placeholder="Notas del turno"
                disabled={submitting}
              />
            </div>
            <Button type="submit" size="sm" disabled={submitting || pacientes.length === 0}>
              {submitting ? "Creando…" : "Dar turno"}
            </Button>
          </form>
        </ComponentCard>

        {createdTurno && pacienteParaEnvio && (
          <ComponentCard title="Enviar confirmación al paciente">
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Turno <strong>{createdTurno.numero_turno}</strong> para{" "}
              {pacienteParaEnvio.apellido}, {pacienteParaEnvio.nombre}.
              {!pacienteParaEnvio.email && !pacienteParaEnvio.telefono && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Este paciente no tiene correo ni teléfono. Agréguelos en Pacientes para poder enviar.
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {pacienteParaEnvio.email && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!enviando}
                  onClick={() => handleEnviar("email")}
                >
                  {enviando === "email" ? "Enviando…" : "Enviar por correo"}
                </Button>
              )}
              {pacienteParaEnvio.telefono && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!enviando}
                  onClick={() => handleEnviar("sms")}
                >
                  {enviando === "sms" ? "Enviando…" : "Enviar por SMS"}
                </Button>
              )}
            </div>
            {enviadoMsg && (
              <p className={`mt-2 text-sm ${enviadoMsg.ok ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                {enviadoMsg.texto}
              </p>
            )}
            <Button
              size="sm"
              className="mt-3"
              variant="outline"
              onClick={() => {
                setCreatedTurno(null);
                setPacienteParaEnvio(null);
                setEnviadoMsg(null);
              }}
            >
              Listo, crear otro turno
            </Button>
          </ComponentCard>
        )}
      </div>
    </div>
  );
}
