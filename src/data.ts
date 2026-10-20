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

function parseRoute(raw: string): Route {
  const [id, name, urdu, type, status, firstStop, lastStop] = raw.split('@')
  return { id, name, urdu, type, status, firstStop, lastStop }
}

function parseStop(raw: string): Stop {
  const [id, name, urdu] = raw.split('@')
  return { id, name, urdu }
}

let dataPromise: Promise<TransitData> | undefined

export function loadData(): Promise<TransitData> {
  dataPromise ||= Promise.all([
    fetch('/data/routes.json').then(response => { if (!response.ok) throw new Error('Routes unavailable'); return response.json() as Promise<string[]> }),
    fetch('/data/stops.json').then(response => { if (!response.ok) throw new Error('Stops unavailable'); return response.json() as Promise<string[]> }),
    fetch('/data/stops_on_a_route.json').then(response => { if (!response.ok) throw new Error('Route stops unavailable'); return response.json() as Promise<Record<string, string>> }),
    fetch('/data/routes_on_a_stop.json').then(response => { if (!response.ok) throw new Error('Stop routes unavailable'); return response.json() as Promise<Record<string, string>> }),
  ]).then(([routeRows, stopRows, stopsOnRoute, routesOnStop]) => {
    const routes = routeRows.filter(Boolean).map(parseRoute)
    const stops = stopRows.filter(Boolean).map(parseStop)
    return {
      routes,
      stops,
      routeById: new Map(routes.map(route => [route.id, route])),
      stopById: new Map(stops.map(stop => [stop.id, stop])),
      stopsOnRoute,
      routesOnStop,
    }
  })
  return dataPromise
}

let pairsPromise: Promise<Record<string, string>> | undefined

export function loadPairs() {
  pairsPromise ||= fetch('/data/routes_btw_stops.json').then(response => { if (!response.ok) throw new Error('Suggestions unavailable'); return response.json() as Promise<Record<string, string>> })
  return pairsPromise
}
