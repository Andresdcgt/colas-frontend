import { useEffect, useState, useMemo } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ComponentCard from "../components/common/ComponentCard";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import { useAuth } from "../context/AuthContext";
import { filterByTenant } from "../lib/tenant-filter";
import {
  getSucursales,
  createSucursal,
  getTenants,
  type Sucursal,
  type Tenant,
} from "../lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../components/ui/table";

export default function Sucursales() {
  const { user } = useAuth();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ tenant_id: "", nombre: "", direccion: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const isRoot = user?.role === "root";
  const canCreateSucursal = isRoot || user?.role === "admin_clinica";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [sucRes, tenRes] = await Promise.all([
        getSucursales(),
        isRoot ? getTenants() : Promise.resolve({ tenants: [] }),
      ]);
      setSucursales(sucRes.sucursales);
      if (isRoot) {
        setTenants(tenRes.tenants.filter((t) => t.status === "active"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [isRoot]);

  useEffect(() => {
    if (isRoot && modalOpen) {
      getTenants()
        .then((d) => setTenants((prev) => (prev.length ? prev : d.tenants.filter((t) => t.status === "active"))))
        .catch(() => {});
    }
  }, [isRoot, modalOpen]);

  const sucursalesByTenant = useMemo(() => {
    const map = new Map<string, Sucursal[]>();
    sucursales.forEach((s) => {
      const list = map.get(s.tenant_id) ?? [];
      list.push(s);
      map.set(s.tenant_id, list);
    });
    return map;
  }, [sucursales]);

  const tenantsWithSucursales = useMemo(() => {
    if (!isRoot) return [];
    const tenantIds = new Set(sucursales.map((s) => s.tenant_id));
    const fromSucursales = tenants.filter((t) => tenantIds.has(t.id));
    const withoutSucursales = tenants.filter((t) => !tenantIds.has(t.id));
    const combined = [...fromSucursales, ...withoutSucursales];
    return combined.filter((t, i) => combined.findIndex((x) => x.id === t.id) === i);
  }, [isRoot, tenants, sucursales]);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) ?? tenantsWithSucursales.find((t) => t.id === selectedTenantId);
  const sucursalesOfSelected = selectedTenantId ? (sucursalesByTenant.get(selectedTenantId) ?? []) : [];

  const openCreateModal = (prefillTenantId?: string) => {
    setCreateError("");
    setForm({
      tenant_id: prefillTenantId ?? (isRoot ? "" : user?.tenantId ?? ""),
      nombre: "",
      direccion: "",
    });
    setModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (!form.nombre.trim()) {
      setCreateError("El nombre es obligatorio");
      return;
    }
    if (isRoot && !form.tenant_id) {
      setCreateError("Selecciona una clínica");
      return;
    }
    setCreating(true);
    try {
      await createSucursal({
        nombre: form.nombre.trim(),
        direccion: form.direccion.trim() || undefined,
        ...(isRoot && form.tenant_id ? { tenant_id: form.tenant_id } : {}),
      });
      setModalOpen(false);
      setForm({ tenant_id: "", nombre: "", direccion: "" });
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setCreating(false);
    }
  };

  const mySucursales = useMemo(() => {
    if (isRoot) return [];
    return filterByTenant(sucursales, user?.tenantId, isRoot);
  }, [isRoot, user?.tenantId, sucursales]);

  return (
    <>
      <PageMeta title="Sucursales | Colas Turnos" description="Sedes de cada clínica" />
      <PageBreadcrumb pageTitle="Sucursales" />
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-center text-gray-500">Cargando…</p>
          </div>
        ) : isRoot ? (
          <>
            <ComponentCard title="Clínica / Hospital">
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                Elige una clínica para ver sus sucursales.
              </p>
              <select
                value={selectedTenantId ?? ""}
                onChange={(e) => setSelectedTenantId(e.target.value || null)}
                className="h-11 w-full max-w-md rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">Selecciona una clínica</option>
                {tenantsWithSucursales.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug}) — {sucursalesByTenant.get(t.id)?.length ?? 0} sucursales
                  </option>
                ))}
              </select>
            </ComponentCard>

            {selectedTenantId ? (
              <ComponentCard title={selectedTenant ? `Sucursales de ${selectedTenant.name}` : "Sucursales"}>
                {canCreateSucursal && (
                  <div className="flex justify-end mb-4">
                    <Button size="sm" onClick={() => openCreateModal(selectedTenantId)}>
                      Nueva sucursal
                    </Button>
                  </div>
                )}
                {sucursalesOfSelected.length === 0 ? (
                  <p className="py-8 text-center text-gray-500 dark:text-gray-400">
                    {canCreateSucursal ? 'No hay sucursales. Agrega una con el botón "Nueva sucursal".' : "No hay sucursales."}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableCell isHeader>Nombre</TableCell>
                        <TableCell isHeader>Dirección</TableCell>
                        <TableCell isHeader>Estado</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sucursalesOfSelected.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium text-gray-900 dark:text-white">
                            {s.nombre}
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {s.direccion || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              color={s.activo ? "success" : "warning"}
                              variant="light"
                              size="sm"
                            >
                              {s.activo ? "Activa" : "Inactiva"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ComponentCard>
            ) : tenantsWithSucursales.length === 0 ? (
              <ComponentCard title="Listado de sucursales">
                <p className="py-6 text-center text-gray-500 dark:text-gray-400">
                  No hay clínicas activas. Crea clínicas desde <strong>Clínicas y Hospitales</strong> y luego elige una aquí.
                </p>
              </ComponentCard>
            ) : null}
          </>
        ) : (
          <>
            {canCreateSucursal && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => openCreateModal()}>
                  Nueva sucursal
                </Button>
              </div>
            )}
            <ComponentCard title="Tus sucursales">
              {mySucursales.length === 0 ? (
                <p className="py-8 text-center text-gray-500 dark:text-gray-400">
                  {canCreateSucursal ? 'No hay sucursales. Crea una con el botón "Nueva sucursal".' : "No hay sucursales."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell isHeader>Nombre</TableCell>
                      <TableCell isHeader>Dirección</TableCell>
                      <TableCell isHeader>Estado</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mySucursales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-gray-900 dark:text-white">
                          {s.nombre}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {s.direccion || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            color={s.activo ? "success" : "warning"}
                            variant="light"
                            size="sm"
                          >
                            {s.activo ? "Activa" : "Inactiva"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ComponentCard>
          </>
        )}
      </div>

      {canCreateSucursal && (
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="max-w-md p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            Nueva sucursal
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <div className="rounded-lg border border-error-200 bg-error-50 p-2.5 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
                {createError}
              </div>
            )}
            {isRoot && (
              <div>
                <Label>Clínica / Hospital</Label>
                <select
                  value={form.tenant_id}
                  onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
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
                placeholder="Ej. Sucursal Centro"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                disabled={creating}
                required
              />
            </div>
            <div>
              <Label>Dirección (opcional)</Label>
              <Input
                placeholder="Ej. Av. Principal 123"
                value={form.direccion}
                onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                disabled={creating}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
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
