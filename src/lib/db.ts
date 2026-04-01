import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCurrentTenantId } from "./tenant-context";
import { getTenantConfig } from "./tenants";

// ── Tenant-aware Prisma client pool ──────────────────────────────────────────

const clientPool = new Map<string, PrismaClient>();

function getClientForTenant(tenantId: string): PrismaClient {
  const existing = clientPool.get(tenantId);
  if (existing) return existing;

  const config = getTenantConfig(tenantId);
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  const client = new PrismaClient({ adapter });
  clientPool.set(tenantId, client);
  return client;
}

// ── Proxy export — routes to correct PrismaClient per request ────────────────
//
// All 31 service files import `prisma` from this module and call methods on it.
// The Proxy intercepts every property access and delegates to the tenant-specific
// PrismaClient. Service code is completely unaware of multi-tenancy.

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const tenantId = getCurrentTenantId();
    const client = getClientForTenant(tenantId);
    const value = Reflect.get(client, prop, receiver);
    // Bind methods so `this` points to the real client (needed for $transaction, etc.)
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
