export type TenantConfig = {
  id: string;
  name: string;
  databaseUrl: string;
  minioBucket: string;
};

const tenantCache = new Map<string, TenantConfig>();

function loadTenantRegistry(): Map<string, TenantConfig> {
  if (tenantCache.size > 0) return tenantCache;

  const registry = process.env.TENANT_REGISTRY;
  if (!registry) {
    // Fallback: single-tenant mode using existing env vars
    const fallback: TenantConfig = {
      id: "default",
      name: "Default",
      databaseUrl: process.env.DATABASE_URL!,
      minioBucket: process.env.MINIO_BUCKET!,
    };
    tenantCache.set("default", fallback);
    return tenantCache;
  }

  const tenantIds = registry.split(",").map((s) => s.trim());
  for (const id of tenantIds) {
    const upper = id.toUpperCase();
    const databaseUrl = process.env[`TENANT_${upper}_DATABASE_URL`];
    const minioBucket = process.env[`TENANT_${upper}_MINIO_BUCKET`];
    const name = process.env[`TENANT_${upper}_NAME`] ?? id;

    if (!databaseUrl) {
      throw new Error(`Missing TENANT_${upper}_DATABASE_URL for tenant "${id}"`);
    }
    if (!minioBucket) {
      throw new Error(`Missing TENANT_${upper}_MINIO_BUCKET for tenant "${id}"`);
    }

    tenantCache.set(id, { id, name, databaseUrl, minioBucket });
  }

  return tenantCache;
}

export function getTenantConfig(tenantId: string): TenantConfig {
  const registry = loadTenantRegistry();
  const config = registry.get(tenantId);
  if (!config) {
    throw new Error(`Unknown tenant: "${tenantId}". Known tenants: ${[...registry.keys()].join(", ")}`);
  }
  return config;
}

export function getAllTenants(): TenantConfig[] {
  return [...loadTenantRegistry().values()];
}

export function isSingleTenantMode(): boolean {
  return !process.env.TENANT_REGISTRY;
}
