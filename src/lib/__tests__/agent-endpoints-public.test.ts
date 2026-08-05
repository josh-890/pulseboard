import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every agent endpoint must be exempt from the session-cookie middleware.
 *
 * Agents authenticate with `ARCHIVE_API_KEY` in a header; they have no session
 * cookie. If their path is not in `PUBLIC_PREFIXES`, the middleware redirects
 * them to /login — and that failure is quiet in the worst way: `Invoke-RestMethod`
 * follows the 307, receives a page of HTML with status 200, and the agent
 * concludes the route is missing or answers 405 on POST.
 *
 * That cost a full debugging round when `/api/catalogue/` was added, so the rule
 * is checked here rather than remembered.
 */
const API_ROOT = join(process.cwd(), 'src/app/api')
const MIDDLEWARE = join(process.cwd(), 'src/middleware.ts')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

function publicPrefixes(): string[] {
  const src = readFileSync(MIDDLEWARE, 'utf8')
  const block = /const PUBLIC_PREFIXES\s*=\s*\[([\s\S]*?)\]/.exec(src)
  if (!block) throw new Error('PUBLIC_PREFIXES not found in middleware.ts')
  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
}

describe('agent endpoints are reachable without a session', () => {
  const prefixes = publicPrefixes()

  const agentRoutes = routeFiles(API_ROOT)
    .filter((f) => readFileSync(f, 'utf8').includes('ARCHIVE_API_KEY'))
    .map((f) => '/' + f.slice(join(process.cwd(), 'src/app').length + 1).replace(/\/route\.ts$/, '') + '/')

  it('finds the agent routes at all (guards against this test silently passing)', () => {
    expect(agentRoutes.length).toBeGreaterThan(0)
  })

  it.each(agentRoutes)('%s is covered by a PUBLIC_PREFIX', (route) => {
    const covered = prefixes.some((p) => route.startsWith(p))
    expect(covered, `${route} authenticates with ARCHIVE_API_KEY but the middleware would redirect it to /login`).toBe(
      true,
    )
  })
})
