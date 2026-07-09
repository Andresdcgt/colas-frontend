const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : "http://localhost:3000";

/** Base URL for API and Socket.io (no trailing slash). */
export function getSocketUrl(): string {
  return API_BASE.replace(/\/$/, "");
}

export function getApiUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string | null;
    fullName: string | null;
    sucursalIds?: string[];
  };
  requiresPasswordChange?: boolean;
}

export async function login(
  email: string,
  password: string,
  tenantSlug?: string | null
): Promise<LoginResponse> {
  const res = await fetch(getApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantSlug: tenantSlug || undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Credenciales inválidas");
  }
  return res.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetchWithAuth("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cambiar contraseña");
  }
}

const AUTH_STORAGE_KEY = "colas_auth";

function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { token?: string };
    return data?.token ?? null;
  } catch {
    return null;
  }
}

/** Petición con Authorization: Bearer (token guardado). Para rutas que requieren login. */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(getApiUrl(path), { ...options, headers });
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deleted";
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function getTenants(): Promise<{ tenants: Tenant[] }> {
  const res = await fetchWithAuth("/api/tenants");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar clínicas");
  }
  return res.json();
}

export async function createTenant(body: { name: string; slug: string }): Promise<Tenant> {
  const res = await fetchWithAuth("/api/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al crear clínica");
  }
  return res.json();
}

export async function updateTenant(
  id: string,
  body: { status?: "active" | "suspended" | "deleted"; name?: string; slug?: string }
): Promise<Tenant> {
  const res = await fetchWithAuth(`/api/tenants/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al actualizar");
  }
  return res.json();
}

/** @deprecated Use updateTenant(id, { status }) instead */
export async function updateTenantStatus(id: string, status: "active" | "suspended" | "deleted"): Promise<Tenant> {
  return updateTenant(id, { status });
}

export interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  sucursales?: { id: string; nombre: string }[];
}

export async function getTenantUsers(tenantId: string): Promise<{ users: TenantUser[] }> {
  const res = await fetchWithAuth(`/api/tenants/${tenantId}/users`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar usuarios");
  }
  return res.json();
}

export type CreateTenantUserResult = TenantUser & {
  emailSent?: boolean;
  emailError?: string;
};

export async function createTenantUser(
  tenantId: string,
  body: {
    email: string;
    password: string;
    full_name?: string;
    role: "admin_clinica" | "admin_sucursal" | "recepcion" | "medico";
    sucursal_ids?: string[];
  }
): Promise<CreateTenantUserResult> {
  const res = await fetchWithAuth(`/api/tenants/${tenantId}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al crear usuario");
  }
  return res.json();
}

// --- Pacientes ---
export interface Paciente {
  id: string;
  tenant_id: string;
  nombre: string;
  apellido: string;
  dni: string;
  email: string | null;
  telefono: string | null;
  created_at: string;
  updated_at: string;
}

export async function getPacientes(params?: { search?: string; dni?: string }): Promise<{ pacientes: Paciente[] }> {
  const q = new URLSearchParams();
  if (params?.dni) q.set("dni", params.dni);
  if (params?.search) q.set("search", params.search);
  const query = q.toString();
  const path = `/api/pacientes${query ? `?${query}` : ""}`;
  const res = await fetchWithAuth(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar pacientes");
  }
  return res.json();
}

export async function createPaciente(body: {
  nombre: string;
  apellido: string;
  dni: string;
  email?: string;
  telefono?: string;
  tenant_id?: string;
}): Promise<Paciente> {
  const res = await fetchWithAuth("/api/pacientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al crear paciente");
  }
  return res.json();
}

// --- IGSS afiliación ---
export type AfiliacionIgssResult = {
  elegible: boolean;
  codigo: string;
  mensaje: string;
  numero_afiliacion: string | null;
  nombre_oficial: string | null;
  tipo_afiliacion: string | null;
  fecha_vigencia: string | null;
  fuente: "igss" | "mock";
  validado_at: string;
};

export async function validarAfiliacionIgss(body: {
  cui: string;
  nombre?: string;
  apellido?: string;
  fecha_nacimiento?: string;
}): Promise<AfiliacionIgssResult> {
  const res = await fetchWithAuth("/api/igss/validar-afiliacion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al validar afiliación IGSS");
  }
  return res.json();
}

// --- Sucursales ---
export interface Sucursal {
  id: string;
  tenant_id: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export async function getSucursales(): Promise<{ sucursales: Sucursal[] }> {
  const res = await fetchWithAuth("/api/sucursales");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar sucursales");
  }
  return res.json();
}

export async function createSucursal(body: {
  nombre: string;
  direccion?: string;
  activo?: boolean;
  tenant_id?: string;
}): Promise<Sucursal> {
  const res = await fetchWithAuth("/api/sucursales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al crear sucursal");
  }
  return res.json();
}

// --- Médicos ---
export interface Medico {
  id: string;
  tenant_id: string;
  user_id: string | null;
  nombre: string;
  especialidad: string | null;
  especialidades: string[] | null;
  fecha_nacimiento: string | null;
  documento: string | null;
  matricula: string | null;
  email: string | null;
  telefono: string | null;
  bio: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export async function getMedicos(): Promise<{ medicos: Medico[] }> {
  const res = await fetchWithAuth("/api/medicos");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar médicos");
  }
  return res.json();
}

export type CreateMedicoBody = {
  nombre: string;
  especialidad?: string;
  especialidades?: string[];
  fecha_nacimiento?: string;
  documento?: string;
  matricula?: string;
  email?: string;
  telefono?: string;
  bio?: string;
  tenant_id?: string;
  activo?: boolean;
};

export async function createMedico(body: CreateMedicoBody): Promise<Medico> {
  const res = await fetchWithAuth("/api/medicos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al crear médico");
  }
  return res.json();
}

export type UpdateMedicoBody = Partial<Omit<CreateMedicoBody, "tenant_id">>;

export async function updateMedico(id: string, body: UpdateMedicoBody): Promise<Medico> {
  const res = await fetchWithAuth(`/api/medicos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al actualizar médico");
  }
  return res.json();
}

// --- Consultorios ---
export interface Consultorio {
  id: string;
  tenant_id: string;
  sucursal_id: string;
  medico_id: string | null;
  nombre: string;
  activo: boolean;
  sucursal_nombre?: string;
  medico_nombre?: string;
  medico_especialidad?: string;
}

export async function getConsultorios(): Promise<{ consultorios: Consultorio[] }> {
  const res = await fetchWithAuth("/api/consultorios");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar consultorios");
  }
  return res.json();
}

export async function createConsultorio(body: {
  sucursal_id: string;
  nombre: string;
  medico_id?: string;
  activo?: boolean;
  tenant_id?: string;
}): Promise<Consultorio> {
  const res = await fetchWithAuth("/api/consultorios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al crear consultorio");
  }
  return res.json();
}

// --- Turnos ---
export interface Turno {
  id: string;
  tenant_id: string;
  paciente_id: string;
  consultorio_id: string;
  fecha: string;
  hora: string;
  estado: string;
  prioridad: string;
  numero_turno: string;
  orden: number;
  observaciones: string | null;
  veces_llamado?: number;
  ultima_llamada_at?: string | null;
  reencolado?: boolean;
  motivo_cancelacion?: string | null;
  cancelado_at?: string | null;
  orden_pausa?: number | null;
  pausado_at?: string | null;
  motivo_pausa?: string | null;
  paciente_nombre?: string;
  paciente_apellido?: string;
  paciente_dni?: string;
  consultorio_nombre?: string;
}

export type GetTurnosParams =
  | { fecha: string; consultorio_id?: string }
  | { fecha_desde: string; fecha_hasta: string; consultorio_id?: string };

export async function getTurnos(params: GetTurnosParams): Promise<{ turnos: Turno[] }> {
  const q = new URLSearchParams();
  if ("fecha" in params) {
    q.set("fecha", params.fecha);
  } else {
    q.set("fecha_desde", params.fecha_desde);
    q.set("fecha_hasta", params.fecha_hasta);
  }
  if (params.consultorio_id) q.set("consultorio_id", params.consultorio_id);
  const res = await fetchWithAuth(`/api/turnos?${q.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar turnos");
  }
  return res.json();
}

export const MAX_LLAMADAS_TURNO = 4;

export async function llamarTurno(id: string): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/llamar`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al llamar turno");
  }
  return res.json();
}

export async function reencolarTurno(id: string): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/reencolar`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al reencolar turno");
  }
  return res.json();
}

export async function cancelarTurno(id: string, motivo: string): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/cancelar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo: motivo.trim() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cancelar turno");
  }
  return res.json();
}

export async function recuperarTurno(id: string): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/recuperar`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al recuperar turno");
  }
  return res.json();
}

export async function pausarTurno(id: string, motivo?: string): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/pausar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo: motivo?.trim() || undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al pausar turno");
  }
  return res.json();
}

export type ReanudarAccion = "siguiente" | "esperar";

export async function reanudarTurno(
  id: string,
  accion: ReanudarAccion,
  motivo?: string
): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/reanudar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, motivo: motivo?.trim() || undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al reanudar turno");
  }
  return res.json();
}

export async function marcarNoAsistio(id: string, nota: string): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/marcar-no-asistio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nota: nota.trim() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al registrar no asistió");
  }
  return res.json();
}

export interface PantallaPublicaTurno {
  numero_turno: string;
  estado: string;
  veces_llamado: number;
  ultima_llamada_at: string | null;
  consultorio_nombre: string;
  consultorio_id: string;
}

export interface PantallaPublicaResumen {
  consultorio_nombre: string;
  pendientes: number;
}

export interface PantallaPublicaResponse {
  tenant_name: string;
  fecha: string;
  llamados: PantallaPublicaTurno[];
  en_atencion: PantallaPublicaTurno[];
  resumen_consultorios: PantallaPublicaResumen[];
}

export async function getPantallaPublica(
  tenantSlug: string,
  fecha?: string
): Promise<PantallaPublicaResponse> {
  const q = new URLSearchParams({ tenant_slug: tenantSlug });
  if (fecha) q.set("fecha", fecha);
  const res = await fetch(getApiUrl(`/api/turnos/pantalla-publica?${q.toString()}`));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar pantalla pública");
  }
  return res.json();
}

export async function updateTurnoEstado(id: string, estado: string): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al actualizar turno");
  }
  return res.json();
}

export async function createTurno(body: {
  paciente_id: string;
  consultorio_id: string;
  fecha: string;
  hora: string;
  prioridad?: string;
  observaciones?: string;
  tenant_id?: string;
}): Promise<Turno> {
  const res = await fetchWithAuth("/api/turnos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al crear turno");
  }
  return res.json();
}

export type CanalEnvio = "email" | "sms";

export async function enviarTurno(
  turnoId: string,
  canal: CanalEnvio
): Promise<{ enviado: boolean; mensaje: string }> {
  const res = await fetchWithAuth(`/api/turnos/${turnoId}/enviar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canal }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al enviar");
  }
  return res.json();
}

export interface ConsultorioColaResumen {
  consultorio_id: string;
  consultorio_nombre: string;
  medico_nombre: string | null;
  pacientes_en_cola: number;
}

export async function getConsultoriosColasResumen(
  params?: { fecha?: string }
): Promise<{ consultorios: ConsultorioColaResumen[] }> {
  const q = new URLSearchParams();
  if (params?.fecha) q.set("fecha", params.fecha);
  const path = `/api/consultorios/colas-resumen${q.toString() ? `?${q.toString()}` : ""}`;
  const res = await fetchWithAuth(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar colas de consultorios");
  }
  return res.json();
}

export async function reasignarTurno(
  id: string,
  body: { consultorio_id_destino: string; motivo?: string }
): Promise<Turno> {
  const res = await fetchWithAuth(`/api/turnos/${id}/reasignar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al reasignar turno");
  }
  return res.json();
}

// --- Historial clínico ---

export interface ConsultaMedica {
  consulta_id: string;
  fecha_hora: string;
  motivo_consulta: string | null;
  nota_evolucion?: string | null;
  diagnostico_ppal: string | null;
  diagnosticos_secundarios: string | null;
  signos_vitales: Record<string, unknown> | null;
  medico_id: string;
  medico_nombre: string;
  receta_id: string | null;
  receta_fecha_hora: string | null;
  receta_notas: string | null;
  receta_items?: RecetaItem[];
}

export interface RecetaItem {
  id: string;
  medicamento: string;
  dosis: string | null;
  frecuencia: string | null;
  duracion: string | null;
  via: string | null;
  observaciones: string | null;
}

export async function getHistorialPaciente(
  pacienteId: string
): Promise<{ consultas: ConsultaMedica[]; itemsByReceta: Record<string, RecetaItem[]> }> {
  const res = await fetchWithAuth(`/api/pacientes/${pacienteId}/historial`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al cargar historial clínico");
  }
  return res.json();
}

export async function crearConsultaMedica(body: {
  paciente_id: string;
  medico_id: string;
  turno_id?: string | null;
  fecha_hora?: string | null;
  motivo_consulta?: string | null;
  nota_evolucion?: string | null;
  diagnostico_ppal?: string | null;
  diagnosticos_secundarios?: string | null;
  signos_vitales?: Record<string, unknown> | null;
}): Promise<unknown> {
  const res = await fetchWithAuth("/api/consultas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al guardar consulta");
  }
  return res.json();
}

export async function crearReceta(body: {
  paciente_id: string;
  medico_id: string;
  consulta_id?: string | null;
  fecha_hora?: string | null;
  notas_generales?: string | null;
  items: {
    medicamento: string;
    dosis?: string | null;
    frecuencia?: string | null;
    duracion?: string | null;
    via?: string | null;
    observaciones?: string | null;
  }[];
}): Promise<unknown> {
  const res = await fetchWithAuth("/api/recetas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al guardar receta");
  }
  return res.json();
}
