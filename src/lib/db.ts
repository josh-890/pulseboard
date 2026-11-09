import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { reportSlowQuery, watchPool } from "./stall-monitor";
import { getCurrentTenantId } from "./tenant-context";
import { getTenantConfig } from "./tenants";

// ── Tenant-aware Prisma client pool ──────────────────────────────────────────

const clientPool = new Map<string, PrismaClient>();

function getClientForTenant(tenantId: string): PrismaClient {
  const existing = clientPool.get(tenantId);
  if (existing) return existing;

  const config = getTenantConfig(tenantId);
  // Our own pg Pool (same defaults PrismaPg would use) so the stall monitor can see queries waiting for a connection
  const pool = new Pool({ connectionString: config.databaseUrl });
  watchPool(tenantId, pool);
  const client = new PrismaClient({ adapter: new PrismaPg(pool), log: [{ emit: "event", level: "query" }] });
  client.$on("query", (e) => reportSlowQuery(tenantId, e.duration, e.query));
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
