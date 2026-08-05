import { describe, expect, it, vi, beforeEach } from 'vitest'

// getBaseUrl reads the tenant config, so pin the environment for a pure test.
vi.mock('@/lib/tenant-context', () => ({ getCurrentTenantConfig: () => ({ minioBucket: 'pulseboard' }) }))
vi.mock('@/lib/tenants', () => ({ isSingleTenantMode: () => true }))

const { localMediaUrlOrNull } = await import('@/lib/media-url')

describe('localMediaUrlOrNull', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MINIO_URL = 'http://10.66.20.5:9000/pulseboard'
  })

  it('keeps our own MinIO URLs', () => {
    const url = 'http://10.66.20.5:9000/pulseboard/catalogue/avatar/AI-00QAS-1.jpg'
    expect(localMediaUrlOrNull(url)).toBe(url)
  })

  it('keeps same-origin paths', () => {
    expect(localMediaUrlOrNull('/flags/ger.svg')).toBe('/flags/ger.svg')
  })

  // The case that produced broken-image icons across the contacts register: the
  // source site is hotlink-protected — 200 without a Referer, 403 to a browser.
  it('drops a harvested source URL', () => {
    expect(localMediaUrlOrNull('https://static.thenude.com/models/Nikita_6144/starthumb.jpg')).toBeNull()
  })

  it('drops any other host, however plausible', () => {
    expect(localMediaUrlOrNull('https://cdn.example.com/x.jpg')).toBeNull()
    expect(localMediaUrlOrNull('http://10.66.20.6:9000/pulseboard/x.jpg')).toBeNull()
  })

  it('treats null, empty and unparseable input as no image', () => {
    expect(localMediaUrlOrNull(null)).toBeNull()
    expect(localMediaUrlOrNull(undefined)).toBeNull()
    expect(localMediaUrlOrNull('')).toBeNull()
    expect(localMediaUrlOrNull('not a url')).toBeNull()
  })
})
