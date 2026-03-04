import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { Modal } from "../../components/ui/modal";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { useAuth } from "../../context/AuthContext";
import {
  getTenants,
  createTenant,
  updateTenant,
  getTenantUsers,
  createTenantUser,
  type Tenant,
  type TenantUser,
} from "../../lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Pagination } from "../../components/ui/pagination";

export default function Clinicas() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [adminModalTenant, setAdminModalTenant] = useState<Tenant | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminError, setAdminError] = useState("");

  const isRoot = user?.role === "root";
  const currentAdmin = tenantUsers.find((u) => u.role === "admin_clinica");

  const paginatedTenants = tenants.slice((page - 1) * pageSize, page * pageSize);

  const loadTenants = async () => {
    if (!isRoot) return;
    setLoading(true);
    setError("");
    try {
      const data = await getTenants();
      setTenants(data.tenants);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isRoot) loadTenants();
    else setLoading(false);
  }, [isRoot]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (!createName.trim() || !createSlug.trim()) {
      setCreateError("Nombre y slug son obligatorios");
      return;
    }
    setCreating(true);
    try {
      await createTenant({
        name: createName.trim(),
        slug: createSlug.trim().toLowerCase().replace(/\s+/g, "-"),
      });
      setModalOpen(false);
      setCreateName("");
      setCreateSlug("");
      await loadTenants();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setCreating(false);
    }
  };

  const handleStatus = async (t: Tenant) => {
    const next = t.status === "active" ? "suspended" : "active";
    setUpdatingId(t.id);
    try {
      await updateTenant(t.id, { status: next });
      await loadTenants();
    } finally {
      setUpdatingId(null);
    }
  };

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setEditName(t.name);
    setEditSlug(t.slug);
    setEditError("");
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTenant) return;
    setEditError("");
    if (!editName.trim() || !editSlug.trim()) {
      setEditError("Nombre y slug son obligatorios");
      return;
    }
    setSavingEdit(true);
    try {
      await updateTenant(editTenant.id, {
        name: editName.trim(),
        slug: editSlug.trim().toLowerCase().replace(/\s+/g, "-"),
      });
      setEditTenant(null);
      await loadTenants();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingEdit(false);
    }
  };

  const openAdminModal = async (t: Tenant) => {
    setAdminModalTenant(t);
    setAdminError("");
    setAdminEmail("");
    setAdminFullName("");
    setAdminPassword("");
    setTenantUsers([]);
    if (!t.id) return;
    setLoadingUsers(true);
    try {
      const data = await getTenantUsers(t.id);
      setTenantUsers(data.users);
    } catch {
      setTenantUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminModalTenant) return;
    setAdminError("");
    const email = adminEmail.trim().toLowerCase();
    if (!email) {
      setAdminError("El correo es obligatorio");
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setAdminError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setCreatingAdmin(true);
    try {
      await createTenantUser(adminModalTenant.id, {
        email,
        password: adminPassword,
        full_name: adminFullName.trim() || undefined,
        role: "admin_clinica",
      });
      const data = await getTenantUsers(adminModalTenant.id);
      setTenantUsers(data.users);
      setAdminEmail("");
      setAdminFullName("");
      setAdminPassword("");
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : "Error al crear administrador");
    } finally {
      setCreatingAdmin(false);
    }
  };

  if (!isRoot) {
    return (
      <>
        <PageMeta title="Clínicas | Root" description="Panel Root" />
        <PageBreadcrumb pageTitle="Clínicas" />
        <div className="p-4 text-gray-600 dark:text-gray-400">
          Solo el administrador root puede acceder a esta sección.
        </div>
      </>
    );
  }

  return (
    <>
      <PageMeta title="Clínicas | Root" description="Gestión de clínicas (tenants)" />
      <PageBreadcrumb pageTitle="Clínicas" />
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setModalOpen(true)}>
            Nueva clínica
          </Button>
        </div>
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        <ComponentCard title="Listado de clínicas">
          {loading ? (
            <p className="py-4 text-gray-500">Cargando…</p>
          ) : tenants.length === 0 ? (
            <p className="py-4 text-gray-500">No hay clínicas. Crea una con el botón superior.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Nombre</TableCell>
                    <TableCell isHeader>Slug</TableCell>
                    <TableCell isHeader>Estado</TableCell>
                    <TableCell isHeader>Administrador</TableCell>
                    <TableCell isHeader className="text-right">Acciones</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {t.slug}
                      </TableCell>
                      <TableCell>
                        <Badge
                          color={
                            t.status === "active"
                              ? "success"
                              : t.status === "suspended"
                              ? "warning"
                              : "error"
                          }
                          variant="light"
                          size="sm"
                        >
                          {t.status === "active"
                            ? "Activa"
                            : t.status === "suspended"
                            ? "Suspendida"
                            : "Eliminada"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openAdminModal(t)}
                        >
                          Asignar administrador
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(t)}
                          >
                            Editar
                          </Button>
                          {t.status !== "deleted" && (
                            <Button
                              size="sm"
                              disabled={updatingId === t.id}
                              onClick={() => handleStatus(t)}
                            >
                              {t.status === "active" ? "Suspender" : "Activar"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                totalItems={tenants.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800"
              />
            </>
          )}
        </ComponentCard>
      </div>

      <Modal isOpen={!!editTenant} onClose={() => setEditTenant(null)}>
        <div className="p-6 max-w-md">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            Editar clínica
          </h3>
          <form onSubmit={handleEdit} className="space-y-4">
            {editError && (
              <div className="p-2 text-sm text-red-600 bg-red-50 rounded dark:bg-red-900/20 dark:text-red-400">
                {editError}
              </div>
            )}
            <div>
              <Label>Nombre</Label>
              <Input
                placeholder="Ej. Clínica Central"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={savingEdit}
              />
            </div>
            <div>
              <Label>Slug (identificador en URL)</Label>
              <Input
                placeholder="Ej. clinica-central"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                disabled={savingEdit}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setEditTenant(null)}
                disabled={savingEdit}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={savingEdit}>
                {savingEdit ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal isOpen={!!adminModalTenant} onClose={() => setAdminModalTenant(null)}>
        <div className="p-6 max-w-md">
          <h3 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
            Administrador de la clínica
          </h3>
          {adminModalTenant && (
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {adminModalTenant.name} ({adminModalTenant.slug})
            </p>
          )}
          {loadingUsers ? (
            <p className="py-4 text-gray-500">Cargando usuarios…</p>
          ) : (
            <>
              {currentAdmin && (
                <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Administrador actual:</span>{" "}
                  {currentAdmin.email}
                  {currentAdmin.full_name && ` — ${currentAdmin.full_name}`}
                </div>
              )}
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                {adminError && (
                  <div className="p-2 text-sm text-red-600 bg-red-50 rounded dark:bg-red-900/20 dark:text-red-400">
                    {adminError}
                  </div>
                )}
                <div>
                  <Label>Correo del administrador</Label>
                  <Input
                    type="email"
                    placeholder="admin@clinica.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    disabled={creatingAdmin}
                  />
                </div>
                <div>
                  <Label>Nombre completo (opcional)</Label>
                  <Input
                    placeholder="Ej. María García"
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    disabled={creatingAdmin}
                  />
                </div>
                <div>
                  <Label>Contraseña (mín. 6 caracteres)</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    disabled={creatingAdmin}
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAdminModalTenant(null)}
                    disabled={creatingAdmin}
                  >
                    Cerrar
                  </Button>
                  <Button type="submit" size="sm" disabled={creatingAdmin}>
                    {creatingAdmin ? "Creando…" : "Crear administrador"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 max-w-md">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            Nueva clínica
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <div className="p-2 text-sm text-red-600 bg-red-50 rounded dark:bg-red-900/20 dark:text-red-400">
                {createError}
              </div>
            )}
            <div>
              <Label>Nombre</Label>
              <Input
                placeholder="Ej. Clínica Central"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div>
              <Label>Slug (identificador en URL)</Label>
              <Input
                placeholder="Ej. clinica-central"
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
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
    </>
  );
}
