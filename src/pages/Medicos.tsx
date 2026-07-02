import { useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ComponentCard from "../components/common/ComponentCard";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import { filterByTenant } from "../lib/tenant-filter";
import { useAuth } from "../context/AuthContext";
import {
  getMedicos,
  createMedico,
  updateMedico,
  getTenants,
  type Medico,
  type Tenant,
} from "../lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Pagination } from "../components/ui/pagination";

function calcularEdad(fecha: string | null): number | null {
  if (!fecha) return null;
  const n = new Date(fecha);
  if (Number.isNaN(n.getTime())) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
  return e;
}

const EMPTY_FORM = {
  tenant_id: "",
  nombre: "",
  especialidad: "",
  especialidadesText: "" as string,
  fecha_nacimiento: "",
  documento: "",
  matricula: "",
  email: "",
  telefono: "",
  bio: "",
  activo: true,
};

export default function Medicos() {
  const { user } = useAuth();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Medico | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isRoot = user?.role === "root";
  const canWriteMedico =
    isRoot || user?.role === "admin_clinica" || user?.role === "admin_sucursal";
  const paginatedMedicos = medicos.slice((page - 1) * pageSize, page * pageSize);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMedicos();
      setMedicos(filterByTenant(data.medicos, user?.tenantId, isRoot));
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (isRoot && modalOpen) {
      getTenants()
        .then((d) => setTenants(d.tenants.filter((t) => t.status === "active")))
        .catch(() => setTenants([]));
    }
  }, [isRoot, modalOpen]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError("");
    setModalOpen(true);
  };

  const openEdit = (m: Medico) => {
    setEditing(m);
    setForm({
      tenant_id: "",
      nombre: m.nombre,
      especialidad: m.especialidad ?? "",
      especialidadesText: Array.isArray(m.especialidades) ? m.especialidades.join(", ") : "",
      fecha_nacimiento: m.fecha_nacimiento ?? "",
      documento: m.documento ?? "",
      matricula: m.matricula ?? "",
      email: m.email ?? "",
      telefono: m.telefono ?? "",
      bio: m.bio ?? "",
      activo: m.activo,
    });
    setSaveError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    if (!form.nombre.trim()) {
      setSaveError("El nombre es obligatorio");
      return;
    }
    if (editing) {
      const especialidades = form.especialidadesText
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      setSaving(true);
      try {
        await updateMedico(editing.id, {
          nombre: form.nombre.trim(),
          especialidad: form.especialidad.trim() || undefined,
          especialidades: especialidades.length ? especialidades : undefined,
          fecha_nacimiento: form.fecha_nacimiento || undefined,
          documento: form.documento.trim() || undefined,
          matricula: form.matricula.trim() || undefined,
          email: form.email.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          bio: form.bio.trim() || undefined,
          activo: form.activo,
        });
        setModalOpen(false);
        await load();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Error al guardar");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (isRoot && !form.tenant_id) {
      setSaveError("Selecciona una clínica");
      return;
    }
    const especialidades = form.especialidadesText
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      await createMedico({
        nombre: form.nombre.trim(),
        especialidad: form.especialidad.trim() || undefined,
        especialidades: especialidades.length ? especialidades : undefined,
        fecha_nacimiento: form.fecha_nacimiento || undefined,
        documento: form.documento.trim() || undefined,
        matricula: form.matricula.trim() || undefined,
        email: form.email.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        bio: form.bio.trim() || undefined,
        activo: form.activo,
        ...(isRoot && form.tenant_id ? { tenant_id: form.tenant_id } : {}),
      });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageMeta title="Médicos | Colas Turnos" description="Perfiles de médicos de la clínica" />
      <PageBreadcrumb pageTitle="Médicos" />
      <div className="space-y-6">
        {canWriteMedico && (
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}>
              Nuevo médico
            </Button>
          </div>
        )}
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <ComponentCard title="Listado de médicos">
          {loading ? (
            <p className="py-4 text-gray-500">Cargando…</p>
          ) : medicos.length === 0 ? (
            <p className="py-4 text-gray-500">
              No hay médicos. Crea uno desde el botón &quot;Nuevo médico&quot;.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Nombre</TableCell>
                    <TableCell isHeader>Edad</TableCell>
                    <TableCell isHeader>Especialidad(es)</TableCell>
                    <TableCell isHeader>Documento / Matrícula</TableCell>
                    <TableCell isHeader>Contacto</TableCell>
                    <TableCell isHeader>Estado</TableCell>
                    {canWriteMedico && <TableCell isHeader className="text-right">Acciones</TableCell>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedMedicos.map((m) => {
                  const edad = calcularEdad(m.fecha_nacimiento);
                  const especialidades = Array.isArray(m.especialidades) && m.especialidades.length
                    ? m.especialidades.join(", ")
                    : m.especialidad ?? "—";
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-gray-900 dark:text-white">
                        {m.nombre}
                      </TableCell>
                      <TableCell>{edad != null ? `${edad} años` : "—"}</TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={especialidades}>
                        {especialidades}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {m.documento ? `DNI ${m.documento}` : "—"}
                        {m.matricula ? ` · Mat. ${m.matricula}` : ""}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {m.email || m.telefono || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          color={m.activo ? "success" : "warning"}
                          variant="light"
                          size="sm"
                        >
                          {m.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      {canWriteMedico && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                            Editar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                totalItems={medicos.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800"
              />
            </>
          )}
        </ComponentCard>
      </div>

      {canWriteMedico && (
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 max-w-lg max-h-[90vh] overflow-y-auto">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            {editing ? "Editar médico" : "Nuevo médico"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {saveError && (
              <div className="p-2 text-sm text-red-600 bg-red-50 rounded dark:bg-red-900/20 dark:text-red-400">
                {saveError}
              </div>
            )}
            {isRoot && !editing && (
              <div>
                <Label>Clínica</Label>
                <select
                  value={form.tenant_id}
                  onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  required={isRoot}
                >
                  <option value="">Selecciona clínica</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Nombre completo</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Dr. Juan Pérez"
                disabled={saving}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha de nacimiento</Label>
                <Input
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div>
                <Label>Documento (DNI)</Label>
                <Input
                  value={form.documento}
                  onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))}
                  placeholder="Ej. 12345678"
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <Label>Matrícula / Colegiado</Label>
              <Input
                value={form.matricula}
                onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
                placeholder="Número de matrícula profesional"
                disabled={saving}
              />
            </div>
            <div>
              <Label>Especialidad principal</Label>
              <Input
                value={form.especialidad}
                onChange={(e) => setForm((f) => ({ ...f, especialidad: e.target.value }))}
                placeholder="Ej. Clínica médica"
                disabled={saving}
              />
            </div>
            <div>
              <Label>Otras especialidades (separadas por coma o punto y coma)</Label>
              <input
                type="text"
                value={form.especialidadesText}
                onChange={(e) => setForm((f) => ({ ...f, especialidadesText: e.target.value }))}
                placeholder="Ej. Cardiología, Medicina interna"
                disabled={saving}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  disabled={saving}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  placeholder="Ej. 099123456"
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <Label>Biografía / Notas (opcional)</Label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="Breve descripción o notas del profesional"
                disabled={saving}
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="medico-activo"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                  disabled={saving}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="medico-activo" className="!mb-0">Activo</Label>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Guardando…" : editing ? "Guardar" : "Crear"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
      )}
    </>
  );
}
