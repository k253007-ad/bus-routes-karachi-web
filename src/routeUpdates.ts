import type { RawTransitSnapshot } from './data'

export type VerifiedRouteUpdates = {
  revision: string
  checkedOn: string
  stopRows: string[]
  changes: { id: string; row: string; stops: string[]; sourceUrl: string; note: string }[]
}

/** Merge reviewed public-source corrections after validating the base snapshot. */
export function mergeRouteUpdates(raw: RawTransitSnapshot, updates: VerifiedRouteUpdates): RawTransitSnapshot {
  if (!Array.isArray(raw.routes) || !Array.isArray(raw.stops) || !raw.stopsOnRoute || typeof raw.stopsOnRoute !== 'object') {
    throw new Error('Invalid base route snapshot')
  }
  const routes = new Map<string, string>(raw.routes.map(row => [String(row).split('@')[0], row]))
  const stops = new Map<string, string>(raw.stops.map(row => [String(row).split('@')[0], row]))
  const stopsOnRoute = { ...raw.stopsOnRoute } as Record<string, string>
  for (const row of updates.stopRows) stops.set(row.split('@')[0], row)
  for (const change of updates.changes) {
    if (change.row.split('@')[0] !== change.id || !change.stops.length) throw new Error('Invalid reviewed route update')
    routes.set(change.id, change.row)
    stopsOnRoute[change.id] = change.stops.join(', ')
  }
  return { routes: [...routes.values()], stops: [...stops.values()], stopsOnRoute }
}
