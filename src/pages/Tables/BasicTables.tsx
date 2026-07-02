import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Pagination } from "../../components/ui/pagination";
import { filterByTenant } from "../../lib/tenant-filter";
import { useAuth } from "../../context/AuthContext";
import {
  getPacientes,
  createPaciente,
  getTenants,
  type Paciente,
  type Tenant,
} from "../../lib/api";

export default function BasicTables() {
  const { user } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [form, setForm] = useState({
    tenant_id: "",
    nombre: "",
    apellido: "",
    dni: "",
    email: "",
    telefono: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isRoot = user?.role === "root";
  const canCreatePaciente =
    isRoot ||
    user?.role === "admin_clinica" ||
    user?.role === "admin_sucursal" ||
    user?.role === "recepcion";
  const paginatedPacientes = pacientes.slice((page - 1) * pageSize, page * pageSize);

  const loadPacientes = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getPacientes(search ? { search } : undefined);
      setPacientes(filterByTenant(data.pacientes, user?.tenantId, isRoot));
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPacientes();
  }, []);

  useEffect(() => {
    if (isRoot && modalOpen) {
      getTenants()
        .then((d) => setTenants(d.tenants))
        .catch(() => setTenants([]));
    }
  }, [isRoot, modalOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPacientes();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (!form.nombre.trim() || !form.apellido.trim() || !form.dni.trim()) {
      setCreateError("Nombre, apellido y DNI son obligatorios");
      return;
    }
    if (isRoot && !form.tenant_id) {
      setCreateError("Selecciona una clínica");
      return;
    }
    setCreating(true);
    try {
      await createPaciente({
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        dni: form.dni.trim(),
        email: form.email.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        ...(isRoot && form.tenant_id ? { tenant_id: form.tenant_id } : {}),
      });
      setModalOpen(false);
      setForm({ tenant_id: "", nombre: "", apellido: "", dni: "", email: "", telefono: "" });
      await loadPacientes();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Pacientes | Colas Turnos"
        description="Listado de pacientes de la clínica"
      />
      <PageBreadcrumb pageTitle="Pacientes" />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Buscar por nombre o apellido"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[200px]"
            />
            <Button type="submit" size="sm">
              Buscar
            </Button>
          </form>
          {canCreatePaciente && (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              Nuevo paciente
            </Button>
          )}
        </div>
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <ComponentCard title="Listado de pacientes">
          {loading ? (
            <p className="py-4 text-gray-500">Cargando…</p>
          ) : pacientes.length === 0 ? (
            <p className="py-4 text-gray-500">
              {canCreatePaciente ? 'No hay pacientes. Usa "Nuevo paciente" para agregar uno.' : "No hay pacientes."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Nombre</TableCell>
                    <TableCell isHeader>Apellido</TableCell>
                    <TableCell isHeader>DNI</TableCell>
                    <TableCell isHeader>Email / Teléfono</TableCell>
                    <TableCell isHeader>Última actualización</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPacientes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {p.nombre}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {p.apellido}
                    </TableCell>
                    <TableCell>{p.dni}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {p.email || p.telefono || "—"}
                    </TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                totalItems={pacientes.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800"
              />
            </>
          )}
        </ComponentCard>
      </div>

      {canCreatePaciente && (
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 max-w-md">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            Nuevo paciente
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <div className="p-2 text-sm text-red-600 bg-red-50 rounded dark:bg-red-900/20 dark:text-red-400">
                {createError}
              </div>
            )}
            {isRoot && (
              <div>
                <Label>Clínica (tenant)</Label>
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
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Juan"
                disabled={creating}
                required
              />
            </div>
            <div>
              <Label>Apellido</Label>
              <Input
                value={form.apellido}
                onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                placeholder="Ej. Pérez"
                disabled={creating}
                required
              />
            </div>
            <div>
              <Label>DNI</Label>
              <Input
                value={form.dni}
                onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))}
                placeholder="Ej. 12345678"
                disabled={creating}
                required
              />
            </div>
            <div>
              <Label>Email (opcional)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
                disabled={creating}
              />
            </div>
            <div>
              <Label>Teléfono (opcional)</Label>
              <Input
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                placeholder="Ej. 099123456"
                disabled={creating}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={creating}>
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
