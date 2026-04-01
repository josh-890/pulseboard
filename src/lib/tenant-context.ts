import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { getTenantConfig, isSingleTenantMode, type TenantConfig } from "./tenants";

// ── React cache for RSC request-scoped storage ───────────────────────────────
// React's cache() creates a per-request memoized function in Server Components.
// Unlike AsyncLocalStorage, this propagates through the RSC render tree.

const getTenantStore = cache(() => ({ tenantId: "" }));

/**
 * Set the tenant ID for the current RSC request.
 * Called from the root layout after reading the x-tenant-id header.
 */
export function setCurrentTenantId(tenantId: string): void {
  getTenantStore().tenantId = tenantId;
}

// ── AsyncLocalStorage for non-RSC contexts ───────────────────────────────────
// Used by: server actions, API routes, scripts, seed files

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
  const tenantId = h.get("x-tenant-id") ?? (isSingleTenantMode() ? "default" : null);
  if (!tenantId) {
    throw new Error("No x-tenant-id header found. Ensure request passes through middleware.");
  }
  return runWithTenant(tenantId, fn);
}

// ── Synchronous tenant resolution (used by Prisma Proxy) ────────────────────

/**
 * Get the current tenant ID synchronously.
 *
 * Resolution chain:
 * 1. React cache store (set by layout via setCurrentTenantId — works in RSC rendering)
 * 2. AsyncLocalStorage (set by withTenantFromHeaders — works in actions/API routes/scripts)
 * 3. TENANT_ID env var (single-tenant scripts)
 * 4. "default" if no TENANT_REGISTRY is set (single-tenant mode)
 */
export function getCurrentTenantId(): string {
  // 1. React cache (RSC rendering — set by root layout)
  try {
    const store = getTenantStore();
    if (store.tenantId) return store.tenantId;
  } catch {
    // cache() may throw outside of React rendering context — fall through
  }

  // 2. AsyncLocalStorage (actions, API routes, scripts via runWithTenant)
  const alsStore = tenantStorage.getStore();
  if (alsStore?.tenantId) return alsStore.tenantId;

  // 3. Explicit env var (scripts that set TENANT_ID directly)
  if (process.env.TENANT_ID) return process.env.TENANT_ID;

  // 4. Single-tenant mode fallback
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
