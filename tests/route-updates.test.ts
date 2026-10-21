import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import updates from '../src/routeUpdates2026.json'
import { mergeRouteUpdates } from '../src/routeUpdates'
import { normalizeTransitData, createTransitStore, findDirectRoutes, type RawTransitSnapshot } from '../src/data'

async function snapshot(): Promise<RawTransitSnapshot> {
  const load = async (name: string) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'))
  return { routes: await load('routes'), stops: await load('stops'), stopsOnRoute: await load('stops_on_a_route') }
}

test('reviewed 2026 updates add R14 and correct termini without losing private routes or saved IDs', async () => {
  const raw = await snapshot()
  const before = normalizeTransitData(raw)
  const original = JSON.stringify(raw)
  const data = normalizeTransitData(mergeRouteUpdates(raw, updates))
  assert.equal(JSON.stringify(raw), original, 'base snapshot is never mutated')
  for (const route of before.routes) assert.ok(data.routeById.has(route.id))
  assert.equal(data.routeById.get('w11')?.name, before.routeById.get('w11')?.name)
  assert.equal(data.stopById.get(data.routeById.get('route14')!.firstStop)?.name, 'Maymar')
  assert.equal(data.routeById.get('route14')?.lastStop, 'S0456')
  assert.equal(data.routeById.get('ev04')?.lastStop, 'S0032')
  assert.equal(data.routeById.get('doubledecker1')?.lastStop, 'S0456')
  assert.equal(data.routeById.get('route04')?.lastStop, 'S0206')
  assert.equal(data.routeById.get('route02')?.lastStop, 'S0226')
  assert.equal(data.routeById.get('pink02')?.lastStop, 'S0226')
  assert.equal(data.routeById.get('route03')?.lastStop, 'S0313')
  assert.ok(!data.stopsOnRoute.ev04.split(', ').includes('S0335'), 'EV4 no longer advertises Numaish')
  assert.ok(findDirectRoutes(data, 'smta_maymar', 'S0456').some(route => route.id === 'route14'))
  assert.ok(!data.routeById.has('route05') && !data.routeById.has('route06') && !data.routeById.has('route07'))
})

test('the reviewed merge is idempotent and reverse indexes include the added route', async () => {
  const once = mergeRouteUpdates(await snapshot(), updates)
  const twice = mergeRouteUpdates(once, updates)
  assert.deepEqual(twice, once)
  const data = normalizeTransitData(twice)
  assert.equal(data.routesOnStop['smta_maymar'], 'route14')
  assert.equal(new Set(data.routes.map(route => route.id)).size, data.routes.length)
})

test('R4 serves the published Guru Mandir, Taj Complex and High Court corridor', async () => {
  const data = normalizeTransitData(mergeRouteUpdates(await snapshot(), updates))
  for (const stop of ['S0153', 'S0481', 'smta_sindh_high_court']) {
    assert.ok(findDirectRoutes(data, stop, 'S0206').some(route => route.id === 'route04'), stop)
  }
  assert.ok(!data.stopsOnRoute.route04.split(', ').includes('S0455'), 'old Tibet Center branch must not replace current published corridor')
})

test('older online and saved Firebase snapshots cannot remove reviewed route updates', async () => {
  const current = await snapshot()
  const rows = new Map((current.routes as string[]).map(row => [row.split('@')[0], row]))
  const stopsOnRoute = { ...current.stopsOnRoute as Record<string, string> }
  for (const change of updates.changes) {
    if (change.previousRow) { rows.set(change.id, change.previousRow); stopsOnRoute[change.id] = change.previousStops! }
    else { rows.delete(change.id); delete stopsOnRoute[change.id] }
  }
  const raw: RawTransitSnapshot = { routes: [...rows.values()], stops: current.stops, stopsOnRoute }
  assert.ok(!rows.has('route14'))
  let stored = ''
  const storage = { getItem: () => stored || null, setItem: (_: string, value: string) => { stored = value } }
  const request = async (url: string) => {
    if (url.endsWith('db_version.json')) return 1769437824443
    if (url.endsWith('routes.json') || url.endsWith('route_list.json')) return raw.routes
    if (url.endsWith('stops.json') || url.endsWith('stop_list.json')) return raw.stops
    if (url.endsWith('stops_on_a_route.json')) return raw.stopsOnRoute
    throw new Error('Unexpected request')
  }
  const store = createTransitStore({ request, storage: () => storage, routeUpdates: updates })
  await store.loadData()
  await store.refreshData()
  assert.ok((await store.loadData()).routeById.has('route14'))
  assert.equal((await store.loadData()).routeById.get('ev04')?.lastStop, 'S0032')
  const restarted = createTransitStore({ request, storage: () => storage, routeUpdates: updates })
  assert.ok((await restarted.loadData()).routeById.has('route14'))
})
