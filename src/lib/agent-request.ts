import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'

/** The Windows agents authenticate with the shared archive key (x-archive-key) */
export function isAgentAuthorized(request: Request): boolean {
  const apiKey = process.env.ARCHIVE_API_KEY
  if (!apiKey) return false
  return request.headers.get('x-archive-key') === apiKey
}

/** The tenant an agent names (x-tenant-id), else the only or first one */
export function resolveAgentTenant(request: Request): string {
  const requested = request.headers.get('x-tenant-id')
  if (requested) return requested
  if (isSingleTenantMode()) return 'default'
  return getAllTenants()[0]?.id ?? 'default'
}
