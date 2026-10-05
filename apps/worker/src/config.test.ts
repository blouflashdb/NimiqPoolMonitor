import { afterEach, expect, it, vi } from 'vitest'

async function loadConfig() {
  vi.resetModules()
  return (await import('./config.ts')).config
}

afterEach(() => vi.unstubAllEnvs())

it('excludes non-operational pools by default', async () => {
  vi.stubEnv('POOL_EXCLUDE', undefined)
  expect((await loadConfig()).poolExclude).toEqual([
    'NQ85 EA0M YF3E P9AX SM2C 58KX GD0B SXJE K2PJ',
    'NQ12 M1PJ QH7K DNAC JREU 0LD0 M4YS TQKA 751B',
  ])
})

it('empty POOL_EXCLUDE excludes nothing', async () => {
  vi.stubEnv('POOL_EXCLUDE', '')
  expect((await loadConfig()).poolExclude).toEqual([])
})

it('a custom exclusion list replaces the defaults', async () => {
  vi.stubEnv('POOL_EXCLUDE', ' NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7 ,')
  expect((await loadConfig()).poolExclude).toEqual(['NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7'])
})
