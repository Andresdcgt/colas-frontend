/** Filtra registros con tenant_id al tenant del usuario (defensa en profundidad). Root ve todo. */
export function filterByTenant<T extends { tenant_id: string }>(
  items: T[],
  tenantId: string | null | undefined,
  isRoot: boolean
): T[] {
  if (isRoot || !tenantId) return items;
  return items.filter((item) => item.tenant_id === tenantId);
}
