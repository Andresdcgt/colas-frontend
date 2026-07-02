import { useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ComponentCard from "../components/common/ComponentCard";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import Label from "../components/form/Label";
import { filterByTenant } from "../lib/tenant-filter";
import { useAuth } from "../context/AuthContext";
import {
  getConsultorios,
  createConsultorio,
  getSucursales,
  getMedicos,
  getTenants,
  type Consultorio,
  type Sucursal,
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

export default function Consultorios() {
  const { user } = useAuth();
  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    tenant_id: "",
    sucursal_id: "",
    medico_id: "",
    nombre: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isRoot = user?.role === "root";
  const canCreateConsultorio =
    isRoot || user?.role === "admin_clinica" || user?.role === "admin_sucursal";
  const paginatedConsultorios = consultorios.slice((page - 1) * pageSize, page * pageSize);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getConsultorios();
      setConsultorios(filterByTenant(data.consultorios, user?.tenantId, isRoot));
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
    if (modalOpen) {
      Promise.all([getSucursales(), getMedicos()])
        .then(([s, m]) => {
          setSucursales(
            filterByTenant(s.sucursales, user?.tenantId, isRoot).filter((x) => x.activo)
          );
          setMedicos(
            filterByTenant(m.medicos, user?.tenantId, isRoot).filter((x) => x.activo)
          );
        })
        .catch(() => {});
      if (isRoot) {
        getTenants()
          .then((d) => setTenants(d.tenants.filter((t) => t.status === "active")))
          .catch(() => setTenants([]));
      }
    }
  }, [modalOpen, isRoot]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (!form.nombre.trim() || !form.sucursal_id) {
      setCreateError("Nombre y sucursal son obligatorios");
      return;
    }
    if (isRoot && !form.tenant_id) {
      setCreateError("Selecciona una clínica");
      return;
    }
    setCreating(true);
    try {
      await createConsultorio({
        sucursal_id: form.sucursal_id,
        nombre: form.nombre.trim(),
        medico_id: form.medico_id || undefined,
        ...(isRoot && form.tenant_id ? { tenant_id: form.tenant_id } : {}),
      });
      setModalOpen(false);
      setForm({ tenant_id: "", sucursal_id: "", medico_id: "", nombre: "" });
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageMeta title="Consultorios | Colas Turnos" description="Salas de atención por sucursal" />
      <PageBreadcrumb pageTitle="Consultorios" />
      <div className="space-y-6">
        {canCreateConsultorio && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setModalOpen(true)}>
              Nuevo consultorio
            </Button>
          </div>
        )}
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <ComponentCard title="Listado de consultorios">
          {loading ? (
            <p className="py-4 text-gray-500">Cargando…</p>
          ) : consultorios.length === 0 ? (
            <p className="py-4 text-gray-500">
              No hay consultorios. Crea primero una sucursal y luego un consultorio.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Nombre</TableCell>
                    <TableCell isHeader>Sucursal</TableCell>
                    <TableCell isHeader>Médico</TableCell>
                    <TableCell isHeader>Estado</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedConsultorios.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {c.nombre}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {c.sucursal_nombre ?? "—"}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {c.medico_nombre ? `${c.medico_nombre}${c.medico_especialidad ? ` (${c.medico_especialidad})` : ""}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={c.activo ? "success" : "warning"}
                        variant="light"
                        size="sm"
                      >
                        {c.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                totalItems={consultorios.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800"
              />
            </>
          )}
        </ComponentCard>
      </div>

      {canCreateConsultorio && (
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 max-w-md">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            Nuevo consultorio
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <div className="p-2 text-sm text-red-600 bg-red-50 rounded dark:bg-red-900/20 dark:text-red-400">
                {createError}
              </div>
            )}
            {isRoot && (
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
              <Label>Sucursal</Label>
              <select
                value={form.sucursal_id}
                onChange={(e) => setForm((f) => ({ ...f, sucursal_id: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                required
              >
                <option value="">Selecciona sucursal</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              {sucursales.length === 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  No hay sucursales. Crea una en la página Sucursales.
                </p>
              )}
            </div>
            <div>
              <Label>Nombre del consultorio</Label>
              <input
                type="text"
                placeholder="Ej. Consultorio 1, Box Dr. Pérez"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                disabled={creating}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                required
              />
            </div>
            <div>
              <Label>Médico asignado (opcional)</Label>
              <select
                value={form.medico_id}
                onChange={(e) => setForm((f) => ({ ...f, medico_id: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">Ninguno</option>
                {medicos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                    {m.especialidad ? ` — ${m.especialidad}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" size="sm" onClick={() => setModalOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={creating || sucursales.length === 0}>
                {creating ? "Creando…" : "Crear"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
      )}
    </>
  );
}
