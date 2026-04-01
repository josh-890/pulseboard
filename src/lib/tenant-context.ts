import { AsyncLocalStorage } from "node:async_hooks";
import { getTenantConfig, getAllTenants, isSingleTenantMode, type TenantConfig } from "./tenants";

// ── AsyncLocalStorage for request-scoped tenant context ──────────────────────
// Used by: server actions (via withTenantFromHeaders), API routes, scripts.

type TenantStoreALS = { tenantId: string };

const tenantStorage = new AsyncLocalStorage<TenantStoreALS>();

/**
 * Run a function within a tenant context (AsyncLocalStorage).
 * Used by: server actions (via withTenantFromHeaders), API routes, scripts.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

/**
 * Async helper: reads x-tenant-id from request headers, then runs fn in that tenant context.
 * Use in server actions and API route handlers.
 */
export async function withTenantFromHeaders<T>(fn: () => Promise<T>): Promise<T> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const tenantId = h.get("x-tenant-id") ?? resolveFallbackTenant();
  return runWithTenant(tenantId, fn);
}

// ── Synchronous tenant resolution (used by Prisma Proxy) ────────────────────

/**
 * Get the current tenant ID synchronously.
 *
 * Resolution chain:
 * 1. AsyncLocalStorage (set by withTenantFromHeaders — works in actions/API routes/scripts)
 * 2. TENANT_ID env var (single-tenant scripts)
 * 3. "default" if no TENANT_REGISTRY is set (single-tenant mode)
 * 4. First registered tenant (fallback for RSC rendering where ALS doesn't propagate)
 */
export function getCurrentTenantId(): string {
  // 1. AsyncLocalStorage (actions, API routes, scripts via runWithTenant)
  const alsStore = tenantStorage.getStore();
  if (alsStore?.tenantId) return alsStore.tenantId;

  // 2. Explicit env var (scripts that set TENANT_ID directly)
  if (process.env.TENANT_ID) return process.env.TENANT_ID;

  // 3–4. Fallback
  return resolveFallbackTenant();
}

/**
 * Resolve a fallback tenant ID when no explicit context is set.
 * In single-tenant mode returns "default".
 * In multi-tenant mode returns the first registered tenant.
 * The middleware protects actual data access via login redirects.
 */
function resolveFallbackTenant(): string {
  if (isSingleTenantMode()) return "default";

  const tenants = getAllTenants();
  if (tenants.length > 0) return tenants[0].id;

  return "default";
}

/**
 * Get the full tenant configuration for the current request/context.
 */
export function getCurrentTenantConfig(): TenantConfig {
  return getTenantConfig(getCurrentTenantId());
}
