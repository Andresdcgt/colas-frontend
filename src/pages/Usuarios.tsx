import { useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import ComponentCard from "../components/common/ComponentCard";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { Modal } from "../components/ui/modal";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import { useAuth } from "../context/AuthContext";
import {
  getTenants,
  getTenantUsers,
  createTenantUser,
  getSucursales,
  type Tenant,
  type TenantUser,
  type Sucursal,
} from "../lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Pagination } from "../components/ui/pagination";

const ROL_LABEL: Record<string, string> = {
  admin_clinica: "Administrador",
  admin_sucursal: "Admin. Sucursal",
  recepcion: "Recepcionista",
  medico: "Médico",
};

const ROL_BADGE_COLOR: Record<string, "primary" | "success" | "info" | "warning"> = {
  admin_clinica: "primary",
  admin_sucursal: "warning",
  recepcion: "info",
  medico: "success",
};

type RoleOption = "admin_clinica" | "admin_sucursal" | "recepcion" | "medico";

const ROLES_REQUIRING_SUCURSAL: RoleOption[] = ["admin_sucursal", "recepcion"];

export default function Usuarios() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleOption>("recepcion");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [selectedSucursalIds, setSelectedSucursalIds] = useState<string[]>([]);
  const [loadingSucursales, setLoadingSucursales] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isRoot = user?.role === "root";
  const isAdminClinica = user?.role === "admin_clinica";
  const isAdminSucursal = user?.role === "admin_sucursal";
  const canManageUsers = isRoot || isAdminClinica || isAdminSucursal;
  const tenantId = isRoot ? selectedTenantId : (user?.tenantId ?? null);
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  const paginatedUsers = users.slice((page - 1) * pageSize, page * pageSize);

  const loadTenants = useCallback(async () => {
    if (!isRoot) return;
    setLoadingTenants(true);
    setError("");
    try {
      const data = await getTenants();
      setTenants(data.tenants.filter((t) => t.status === "active"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clínicas");
      setTenants([]);
    } finally {
      setLoadingTenants(false);
    }
  }, [isRoot]);

  const loadUsers = useCallback(async () => {
    if (!tenantId) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    setError("");
    try {
      const data = await getTenantUsers(tenantId);
      setUsers(data.users);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar usuarios");
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (isRoot) loadTenants();
  }, [isRoot, loadTenants]);

  const loadSucursales = useCallback(async () => {
    setLoadingSucursales(true);
    try {
      const data = await getSucursales();
      setSucursales(data.sucursales.filter((s) => s.activo));
    } catch {
      setSucursales([]);
    } finally {
      setLoadingSucursales(false);
    }
  }, []);

  useEffect(() => {
    if (canManageUsers && tenantId) loadSucursales();
    else setSucursales([]);
  }, [canManageUsers, tenantId, loadSucursales]);

  useEffect(() => {
    if (isAdminClinica && user?.tenantId) {
      setSelectedTenantId(user.tenantId);
    }
  }, [isAdminClinica, user?.tenantId]);

  useEffect(() => {
    if (tenantId) loadUsers();
    else setUsers([]);
  }, [tenantId, loadUsers]);

  const openCreateModal = () => {
    setCreateError("");
    setSuccessMessage(null);
    setEmail("");
    setFullName("");
    setPassword("");
    setRole(isRoot ? "admin_clinica" : isAdminSucursal ? "recepcion" : "recepcion");
    setSelectedSucursalIds([]);
    setModalOpen(true);
  };

  const toggleSucursal = (sucursalId: string) => {
    setSelectedSucursalIds((prev) =>
      prev.includes(sucursalId)
        ? prev.filter((id) => id !== sucursalId)
        : [...prev, sucursalId]
    );
  };

  const requiresSucursal = ROLES_REQUIRING_SUCURSAL.includes(role);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setCreateError("");
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm) {
      setCreateError("El correo es obligatorio");
      return;
    }
    if (password.length < 6) {
      setCreateError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (requiresSucursal && selectedSucursalIds.length === 0) {
      setCreateError("Selecciona al menos una sucursal");
      return;
    }
    setCreating(true);
    try {
      const result = await createTenantUser(tenantId, {
        email: emailNorm,
        password,
        full_name: fullName.trim() || undefined,
        role,
        sucursal_ids: requiresSucursal ? selectedSucursalIds : undefined,
      });
      setModalOpen(false);
      setEmail("");
      setFullName("");
      setPassword("");
      await loadUsers();
      if (result.emailSent !== false && !result.emailError) {
        setSuccessMessage(`Usuario creado. Las credenciales se han enviado por correo a ${result.email}.`);
      } else if (result.emailError) {
        setSuccessMessage(`Usuario creado. No se pudo enviar el correo: ${result.emailError}`);
      } else {
        setSuccessMessage("Usuario creado correctamente.");
      }
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al crear usuario");
    } finally {
      setCreating(false);
    }
  };

  if (!canManageUsers) {
    return (
      <>
        <PageMeta title="Usuarios | Colas Turnos" description="Gestión de usuarios" />
        <PageBreadcrumb pageTitle="Usuarios" />
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-gray-600 dark:text-gray-400">
            Solo administradores pueden gestionar usuarios de la clínica o sucursal.
          </p>
        </div>
      </>
    );
  }

  const canCreate = isRoot ? !!selectedTenantId : !!tenantId;
  const roleOptions: { value: RoleOption; label: string }[] = isRoot
    ? [
        { value: "admin_clinica", label: "Administrador (clínica)" },
        { value: "admin_sucursal", label: "Administrador (sucursal)" },
        { value: "recepcion", label: "Recepcionista" },
        { value: "medico", label: "Médico" },
      ]
    : isAdminClinica
      ? [
          { value: "admin_sucursal", label: "Administrador (sucursal)" },
          { value: "recepcion", label: "Recepcionista" },
          { value: "medico", label: "Médico" },
        ]
      : [
          { value: "recepcion", label: "Recepcionista" },
          { value: "medico", label: "Médico" },
        ];

  return (
    <>
      <PageMeta
        title="Usuarios | Colas Turnos"
        description={isRoot ? "Usuarios por clínica (administradores, recepcionistas, médicos)" : "Usuarios de la clínica"}
      />
      <PageBreadcrumb pageTitle="Usuarios" />
      <div className="space-y-6">
        {successMessage && (
          <div
            className="flex items-center justify-between rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800 dark:border-success-800 dark:bg-success-500/10 dark:text-success-400"
            role="alert"
          >
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="shrink-0 rounded p-1 hover:bg-success-200/50 dark:hover:bg-success-500/20"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        )}

        {isRoot && (
          <ComponentCard title="Clínica / Hospital">
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Elige la clínica u hospital para ver sus usuarios y crear administradores, recepcionistas o médicos.
            </p>
            <select
              value={selectedTenantId ?? ""}
              onChange={(e) => setSelectedTenantId(e.target.value || null)}
              className="h-11 w-full max-w-md rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">Selecciona una clínica</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
            {loadingTenants && <p className="mt-2 text-sm text-gray-500">Cargando clínicas…</p>}
          </ComponentCard>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {isRoot && selectedTenant && (
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Usuarios de {selectedTenant.name}
              </h2>
            )}
            {isAdminClinica && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Crea administradores de sucursal, recepcionistas o médicos. Las credenciales se envían por correo.
              </p>
            )}
            {isAdminSucursal && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Crea recepcionistas o médicos para tus sucursales asignadas.
              </p>
            )}
          </div>
          <Button size="sm" onClick={openCreateModal} disabled={!canCreate}>
            Nuevo usuario
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}

        <ComponentCard title={isRoot && selectedTenant ? `Usuarios (${users.length})` : "Usuarios de la clínica"}>
          {isRoot && !selectedTenantId ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Selecciona una clínica arriba para ver y gestionar sus usuarios.
              </p>
            </div>
          ) : loadingUsers ? (
            <p className="py-8 text-center text-gray-500">Cargando usuarios…</p>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="mb-2 text-gray-600 dark:text-gray-400">
                {isRoot ? "Esta clínica aún no tiene usuarios." : "No hay usuarios en tu clínica."}
              </p>
              <p className="mb-4 text-sm text-gray-500">
                Crea el primero con el botón &quot;Nuevo usuario&quot;. Se enviarán las credenciales por correo.
              </p>
              <Button size="sm" onClick={openCreateModal}>
                Nuevo usuario
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Correo</TableCell>
                    <TableCell isHeader>Nombre</TableCell>
                    <TableCell isHeader>Rol</TableCell>
                    <TableCell isHeader>Sucursales</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {u.full_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          color={ROL_BADGE_COLOR[u.role] ?? "light"}
                          variant="light"
                          size="sm"
                        >
                          {ROL_LABEL[u.role] ?? u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400 text-sm">
                        {u.sucursales && u.sucursales.length > 0
                          ? u.sucursales.map((s) => s.nombre).join(", ")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                totalItems={users.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"
              />
            </>
          )}
        </ComponentCard>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 max-w-md">
          <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            Nuevo usuario
          </h3>
          {isRoot && selectedTenant?.name && (
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Clínica: <strong>{selectedTenant.name}</strong>
            </p>
          )}
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/80 py-2.5 px-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-500/10 dark:text-blue-300">
            Las credenciales se enviarán por correo al email indicado. El usuario deberá cambiar la contraseña en el primer acceso.
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <div className="rounded-lg border border-error-200 bg-error-50 p-2.5 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
                {createError}
              </div>
            )}
            <div>
              <Label>Rol</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleOption)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                disabled={creating}
              >
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {requiresSucursal && (
              <div>
                <Label>Sucursales asignadas</Label>
                {loadingSucursales ? (
                  <p className="text-sm text-gray-500">Cargando sucursales…</p>
                ) : sucursales.length === 0 ? (
                  <p className="text-sm text-amber-600">No hay sucursales disponibles.</p>
                ) : (
                  <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    {sucursales.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedSucursalIds.includes(s.id)}
                          onChange={() => toggleSucursal(s.id)}
                          disabled={creating}
                          className="rounded border-gray-300"
                        />
                        <span>{s.nombre}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <Label>Correo</Label>
              <Input
                type="email"
                placeholder="usuario@clinica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={creating}
              />
            </div>
            <div>
              <Label>Nombre completo (opcional)</Label>
              <Input
                placeholder="Ej. Juan Pérez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div>
              <Label>Contraseña temporal (mín. 6 caracteres)</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                {creating ? "Creando…" : "Crear y enviar correo"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
