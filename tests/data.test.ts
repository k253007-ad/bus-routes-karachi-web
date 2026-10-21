import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createTransitStore, normalizeTransitData, findDirectRoutes, TRANSIT_CACHE_KEY, type RawTransitSnapshot } from '../src/data'

const fixture = (): RawTransitSnapshot => ({
  routes: ['r1@First bus@@red@opr@s1@s2', 'r2@Second bus@@bus@opr@s2@s3'],
  stops: ['s1@First stop@', 's2@Second stop@', 's3@Third stop@'],
  stopsOnRoute: { r1: 's1, s2', r2: 's2, s3' },
})
const bundled = (url: string, raw = fixture()): unknown => {
  const value = { '/data/routes.json': raw.routes, '/data/stops.json': raw.stops, '/data/stops_on_a_route.json': raw.stopsOnRoute }[url]
  if (value === undefined) throw new Error('offline')
  return value
}
function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
function remote(raw = fixture(), versions = [10, 10], calls: string[] = []) {
  let versionRead = 0
  return async (url: string): Promise<unknown> => {
    calls.push(url)
    if (url.startsWith('/data/')) return bundled(url)
    if (url.endsWith('/db_version.json')) return versions[Math.min(versionRead++, versions.length - 1)]
    if (url.endsWith('/route_list.json')) return raw.routes
    if (url.endsWith('/stop_list.json')) return raw.stops
    if (url.endsWith('/stops_on_a_route.json')) return raw.stopsOnRoute
    throw new Error(`Unexpected request: ${url}`)
  }
}

test('bundled production snapshot is coherent and derives the full reverse index', async () => {
  const load = async (name: string) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'))
  const data = normalizeTransitData({ routes: await load('routes'), stops: await load('stops'), stopsOnRoute: await load('stops_on_a_route') })
  assert.equal(data.routes.length, 66)
  assert.equal(data.stops.length, 586)
  for (const route of data.routes) {
    for (const stop of data.stopsOnRoute[route.id].split(', ')) assert.ok(data.routesOnStop[stop].split(', ').includes(route.id))
  }
})

test('direct journeys use canonical route membership and reject identical or unknown stops', () => {
  const data = normalizeTransitData(fixture())
  assert.deepEqual(findDirectRoutes(data, 's1', 's2').map(route => route.id), ['r1'])
  assert.deepEqual(findDirectRoutes(data, 's2', 's1').map(route => route.id), ['r1'])
  assert.deepEqual(findDirectRoutes(data, 's1', 's3'), [])
  assert.deepEqual(findDirectRoutes(data, 's1', 's1'), [])
  assert.deepEqual(findDirectRoutes(data, 'unknown', 's2'), [])
})

test('rejects duplicate identifiers, malformed rows, unknown endpoints and inconsistent mappings', () => {
  const mutations: RawTransitSnapshot[] = [
    { ...fixture(), routes: ['r1@Bus@@red@opr@s1@s2', 'r1@Other@@red@opr@s1@s2'] },
    { ...fixture(), stops: ['s1@First@', 's1@Duplicate@'] },
    { ...fixture(), routes: ['broken'] },
    { ...fixture(), stops: ['s1@'] },
    { ...fixture(), routes: ['r1@Bus@@red@opr@s1@unknown'] },
    { ...fixture(), stopsOnRoute: { r1: 's1, s2', r2: 's2, unknown' } },
    { ...fixture(), stopsOnRoute: { r1: 's1, s2' } },
    { ...fixture(), stopsOnRoute: { r1: 's1', r2: 's2, s3' } },
    { ...fixture(), stopsOnRoute: { r1: 's1, s2', unknown: 's2, s3' } },
    { ...fixture(), stopsOnRoute: [] },
  ]
  for (const raw of mutations) assert.throws(() => normalizeTransitData(raw))
})

test('valid repeated visits never duplicate reverse route memberships', () => {
  const raw = fixture()
  raw.stopsOnRoute = { r1: 's1, s2, s1', r2: 's2, s3' }
  assert.equal(normalizeTransitData(raw).routesOnStop.s1, 'r1')
})

test('offline startup retains bundled data and later refresh succeeds with one coherent publication', async () => {
  let online = false
  const storage = memoryStorage()
  const store = createTransitStore({ request: url => online ? remote()(url) : Promise.resolve(bundled(url)), storage: () => storage, now: () => 1000 })
  const initial = await store.loadData()
  await store.refreshData()
  assert.equal(store.getDataSyncStatus().phase, 'offline')
  assert.equal(await store.loadData(), initial)
  let publications = 0
  const unsubscribe = store.subscribeData(() => { publications++ })
  online = true
  await store.refreshData()
  assert.equal(publications, 1)
  assert.deepEqual(store.getDataSyncStatus(), { phase: 'current', source: 'online', updatedAt: 1000 })
  assert.equal(JSON.parse(storage.getItem(TRANSIT_CACHE_KEY)!).version, 10)
  unsubscribe()
})

test('initial bundled failure retries rather than retaining a rejected promise', async () => {
  let available = false
  const store = createTransitStore({ request: async url => { if (!available) throw new Error('temporarily unavailable'); return bundled(url) } })
  await assert.rejects(store.loadData())
  available = true
  assert.equal((await store.loadData()).routes.length, 2)
})

test('valid saved snapshot opens offline without fetching bundled files', async () => {
  const storage = memoryStorage()
  storage.setItem(TRANSIT_CACHE_KEY, JSON.stringify({ schema: 1, raw: fixture(), version: 10, updatedAt: 1000 }))
  let calls = 0
  const store = createTransitStore({ request: async () => { calls++; throw new Error('offline') }, storage: () => storage, now: () => 2000 })
  assert.equal((await store.loadData()).routes.length, 2)
  assert.equal(calls, 0)
  await store.refreshData()
  assert.deepEqual(store.getDataSyncStatus(), { phase: 'offline', source: 'saved', updatedAt: 1000 })
})

test('malformed or blocked cache cannot prevent bundled startup', async () => {
  for (const bad of ['not json', '{}', JSON.stringify({ schema: 1, raw: {}, version: 10, updatedAt: 1 })]) {
    const store = createTransitStore({ request: async url => bundled(url), storage: () => ({ getItem: () => bad, setItem() {} }) })
    assert.equal((await store.loadData()).routes.length, 2)
    assert.equal(store.getDataSyncStatus().source, 'bundled')
  }
  const store = createTransitStore({ request: async url => bundled(url), storage: () => { throw new Error('Storage disabled') } })
  assert.equal((await store.loadData()).routes.length, 2)
})

test('version race rejects the complete update and preserves saved cache and current routes', async () => {
  const storage = memoryStorage()
  const originalCache = JSON.stringify({ schema: 1, raw: fixture(), version: 5, updatedAt: 1000 })
  storage.setItem(TRANSIT_CACHE_KEY, originalCache)
  const store = createTransitStore({ request: remote(fixture(), [10, 11]), storage: () => storage })
  const original = await store.loadData()
  let publications = 0
  store.subscribeData(() => { publications++ })
  await store.refreshData()
  assert.equal(await store.loadData(), original)
  assert.equal(publications, 0)
  assert.equal(storage.getItem(TRANSIT_CACHE_KEY), originalCache)
  assert.equal(store.getDataSyncStatus().phase, 'offline')
})

test('malformed remote snapshot cannot replace the working fallback', async () => {
  const store = createTransitStore({ request: remote({ ...fixture(), stopsOnRoute: {} }) })
  const initial = await store.loadData()
  await store.refreshData()
  assert.equal(await store.loadData(), initial)
  assert.equal(store.getDataSyncStatus().phase, 'offline')
})

test('concurrent refresh calls share a request and unchanged remote version skips dataset download', async () => {
  const calls: string[] = []
  const store = createTransitStore({ request: remote(fixture(), [10, 10], calls) })
  const first = store.refreshData()
  assert.equal(store.refreshData(), first)
  await first
  calls.length = 0
  await store.refreshData()
  assert.equal(calls.length, 1)
  assert.ok(calls[0].endsWith('/db_version.json'))
})

test('storage quota failure preserves a successful live update', async () => {
  const store = createTransitStore({ request: remote(), storage: () => ({ getItem: () => null, setItem: () => { throw new Error('quota') } }) })
  await store.refreshData()
  assert.equal(store.getDataSyncStatus().source, 'online')
  assert.equal(store.getDataSyncStatus().phase, 'current')
})
