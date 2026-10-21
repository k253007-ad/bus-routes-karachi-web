import { requestJson } from './backend/http'
import { firebaseConfig } from './backend/config'

export type Route = {
  id: string
  name: string
  urdu: string
  type: string
  status: string
  firstStop: string
  lastStop: string
}

export type Stop = { id: string; name: string; urdu: string }

export type TransitData = {
  routes: Route[]
  stops: Stop[]
  routeById: Map<string, Route>
  stopById: Map<string, Stop>
  stopsOnRoute: Record<string, string>
  routesOnStop: Record<string, string>
}

export const busTypes = [
  { id: 'dd', name: 'Double Decker', image: 'ic_double_decker.svg' },
  { id: 'metro', name: 'Metro Bus', image: 'ic_metro.svg' },
  { id: 'red', name: 'Red Bus', image: 'ic_red.svg' },
  { id: 'pink', name: 'Pink Bus', image: 'ic_pink.svg' },
  { id: 'ev', name: 'EV Bus', image: 'ic_ev.svg' },
  { id: 'mini', name: 'Mini Bus', image: 'ic_mini.svg' },
  { id: 'coach', name: 'Coach', image: 'ic_coach.svg' },
  { id: 'bus', name: 'Bus', image: 'ic_bus.svg' },
  { id: 'rick', name: 'Rickshaw', image: 'ic_rickshaw.svg' },
] as const

export const typeName = (type: string) => busTypes.find(item => item.id === type)?.name || 'Bus'

export function routeImage(route: Route) {
  if (route.type === 'metro' && /green/i.test(route.name)) return '/images/ic_greenline.svg'
  if (route.type === 'metro' && /orange/i.test(route.name)) return '/images/ic_orangeline.svg'
  return `/images/${busTypes.find(item => item.id === route.type)?.image || 'ic_bus.svg'}`
}

export const ids = (value?: string) => value?.split(',').map(id => id.trim()).filter(Boolean) || []

export type RawTransitSnapshot = { routes: unknown; stops: unknown; stopsOnRoute: unknown }
export type DataSyncStatus = { phase: 'checking' | 'current' | 'offline'; source: 'bundled' | 'saved' | 'online'; updatedAt?: number }
export const TRANSIT_CACHE_KEY = 'konis-transit-snapshot-v1'

const idPattern = /^[A-Za-z0-9_-]{1,80}$/
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function rows(value: unknown, fields: number, max: number): string[][] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error('Invalid transit data')
  return value.map(row => {
    if (typeof row !== 'string' || row.length > 2000) throw new Error('Invalid transit row')
    const parts = row.split('@').map(part => part.trim())
    if (parts.length !== fields || !idPattern.test(parts[0]) || !parts[1]) throw new Error('Invalid transit row')
    return parts
  })
}

/** Reject the entire snapshot when references disagree; partial updates can produce incorrect journeys. */
export function normalizeTransitData(raw: RawTransitSnapshot): TransitData {
  const routes = rows(raw.routes, 7, 10_000).map(([id, name, urdu, type, status, firstStop, lastStop]) => ({ id, name, urdu, type, status, firstStop, lastStop }))
  const stops = rows(raw.stops, 3, 30_000).map(([id, name, urdu]) => ({ id, name, urdu }))
  const routeById = new Map(routes.map(route => [route.id, route]))
  const stopById = new Map(stops.map(stop => [stop.id, stop]))
  if (routeById.size !== routes.length || stopById.size !== stops.length || !isRecord(raw.stopsOnRoute)) throw new Error('Invalid transit identifiers')
  const mapping = raw.stopsOnRoute
  if (Object.keys(mapping).length !== routes.length || Object.keys(mapping).some(id => !routeById.has(id))) throw new Error('Incomplete route stops')
  const stopsOnRoute: Record<string, string> = Object.create(null)
  const reverse: Record<string, string[]> = Object.create(null)
  for (const route of routes) {
    if (!stopById.has(route.firstStop) || !stopById.has(route.lastStop)) throw new Error('Unknown route endpoint')
    const value = mapping[route.id]
    if (typeof value !== 'string' || value.length > 100_000) throw new Error('Invalid route stops')
    const routeStops = value.split(',').map(id => id.trim())
    if (!routeStops.length || routeStops.some(id => !stopById.has(id)) || !routeStops.includes(route.firstStop) || !routeStops.includes(route.lastStop)) throw new Error('Unknown or missing route stop')
    // A route may visit a stop twice; retain ordering but never duplicate its reverse index.
    stopsOnRoute[route.id] = routeStops.join(', ')
    for (const stopId of new Set(routeStops)) (reverse[stopId] ||= []).push(route.id)
  }
  const routesOnStop: Record<string, string> = Object.create(null)
  for (const stop of stops) routesOnStop[stop.id] = (reverse[stop.id] || []).join(', ')
  return { routes, stops, routeById, stopById, stopsOnRoute, routesOnStop }
}

export function findDirectRoutes(data: TransitData, from: string, to: string): Route[] {
  if (from === to || !data.stopById.has(from) || !data.stopById.has(to)) return []
  const destinationRoutes = new Set(ids(data.routesOnStop[to]))
  return ids(data.routesOnStop[from]).filter(id => destinationRoutes.has(id)).map(id => data.routeById.get(id)).filter((route): route is Route => !!route)
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type StoreOptions = { request?: (url: string) => Promise<unknown>; storage?: () => StorageLike | undefined; now?: () => number }
const validVersion = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Dependencies can be replaced for deterministic offline and version-race checks. */
export function createTransitStore(options: StoreOptions = {}) {
  const request = options.request || requestJson
  const now = options.now || Date.now
  const storage = options.storage || (() => typeof localStorage === 'undefined' ? undefined : localStorage)
  let data: TransitData | undefined
  let initial: Promise<TransitData> | undefined
  let refreshing: Promise<void> | undefined
  let remoteVersion: number | undefined
  let status: DataSyncStatus = { phase: 'current', source: 'bundled' }
  const listeners = new Set<(value: TransitData) => void>()
  const syncListeners = new Set<() => void>()
  const publishStatus = (next: DataSyncStatus) => { status = next; for (const listener of syncListeners) listener() }

  function readSaved(): TransitData | undefined {
    try {
      const saved = storage()?.getItem(TRANSIT_CACHE_KEY)
      if (!saved || saved.length > 8_000_000) return
      const cache: unknown = JSON.parse(saved)
      if (!isRecord(cache) || cache.schema !== 1 || !validVersion(cache.version) || !validVersion(cache.updatedAt) || cache.updatedAt > now() + 300_000 || !isRecord(cache.raw)) return
      const parsed = normalizeTransitData(cache.raw as RawTransitSnapshot)
      remoteVersion = cache.version
      status = { phase: 'current', source: 'saved', updatedAt: cache.updatedAt }
      return parsed
    } catch { return undefined }
  }

  function loadData(): Promise<TransitData> {
    if (data) return Promise.resolve(data)
    if (initial) return initial
    const saved = readSaved()
    if (saved) { data = saved; return Promise.resolve(saved) }
    initial = Promise.all([
      request('/data/routes.json'), request('/data/stops.json'), request('/data/stops_on_a_route.json'),
    ]).then(([routes, stops, stopsOnRoute]) => {
      data = normalizeTransitData({ routes, stops, stopsOnRoute })
      return data
    }).finally(() => { initial = undefined })
    return initial
  }

  function refreshData(): Promise<void> {
    if (refreshing) return refreshing
    refreshing = (async () => {
      try {
        await loadData()
        publishStatus({ ...status, phase: 'checking' })
        const endpoint = (path: string) => `${firebaseConfig.databaseURL}/${path}.json`
        const before = await request(endpoint('db_version'))
        if (!validVersion(before)) throw new Error('Invalid data version')
        if (before === remoteVersion) {
          publishStatus({ ...status, phase: 'current' })
          return
        }
        const [routes, stops, stopsOnRoute] = await Promise.all([
          request(endpoint('route_list')), request(endpoint('stop_list')), request(endpoint('stops_on_a_route')),
        ])
        const next = normalizeTransitData({ routes, stops, stopsOnRoute })
        const after = await request(endpoint('db_version'))
        if (after !== before) throw new Error('Transit data changed during download')
        const updatedAt = now()
        // Publish only after the full snapshot and both version checks succeed.
        data = next
        remoteVersion = before
        try { storage()?.setItem(TRANSIT_CACHE_KEY, JSON.stringify({ schema: 1, version: before, updatedAt, raw: { routes, stops, stopsOnRoute } })) } catch { /* The live snapshot remains usable when storage is full or blocked. */ }
        publishStatus({ phase: 'current', source: 'online', updatedAt })
        for (const listener of listeners) listener(next)
      } catch {
        publishStatus({ ...status, phase: 'offline' })
      }
    })().finally(() => { refreshing = undefined })
    return refreshing
  }

  return {
    loadData, refreshData,
    getDataSyncStatus: (): DataSyncStatus => ({ ...status }),
    subscribeData: (listener: (value: TransitData) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    subscribeDataSync: (listener: () => void) => { syncListeners.add(listener); return () => { syncListeners.delete(listener) } },
  }
}

const store = createTransitStore()
export const { loadData, refreshData, getDataSyncStatus, subscribeData, subscribeDataSync } = store
