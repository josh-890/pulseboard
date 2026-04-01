import { AsyncLocalStorage } from "node:async_hooks";
import { getTenantConfig, isSingleTenantMode, type TenantConfig } from "./tenants";

// ── AsyncLocalStorage for request-scoped tenant context ──────────────────────

type TenantStore = { tenantId: string };

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Run a function within a tenant context.
 * Used by: root layout (wraps all page renders), server actions, API routes, scripts.
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
  const tenantId = h.get("x-tenant-id") ?? (isSingleTenantMode() ? "default" : null);
  if (!tenantId) {
    throw new Error("No x-tenant-id header found. Ensure request passes through middleware.");
  }
  return runWithTenant(tenantId, fn);
}

// ── Synchronous tenant resolution (used by Prisma Proxy) ────────────────────

/**
 * Get the current tenant ID synchronously.
 * Reads from AsyncLocalStorage (set by runWithTenant / withTenantFromHeaders).
 *
 * Fallback chain:
 * 1. AsyncLocalStorage store (request context via layout/action/route wrappers)
 * 2. TENANT_ID env var (single-tenant scripts)
 * 3. "default" if no TENANT_REGISTRY is set (single-tenant mode)
 */
export function getCurrentTenantId(): string {
  // 1. AsyncLocalStorage (primary — set by layout, actions, API routes, scripts)
  const store = tenantStorage.getStore();
  if (store?.tenantId) return store.tenantId;

  // 2. Explicit env var (scripts that set TENANT_ID directly)
  if (process.env.TENANT_ID) return process.env.TENANT_ID;

  // 3. Single-tenant mode fallback
  if (isSingleTenantMode()) return "default";

  throw new Error(
    "No tenant context found. Ensure the code runs within runWithTenant() or withTenantFromHeaders(). " +
      "For scripts, use runWithTenant() or set TENANT_ID env var.",
  );
}

/**
 * Get the full tenant configuration for the current request/context.
 */
export function getCurrentTenantConfig(): TenantConfig {
  return getTenantConfig(getCurrentTenantId());
}
