// Local SDK double: no Google network requests or real key needed.
import React from 'react'
import { createRoot } from 'react-dom/client'
import GoogleRouteMap from '../../src/GoogleRouteMap'
import type { TransitData, Route } from '../../src/data'
import '../../src/styles.css'

const state = { maps: 0, liveMarkers: 0, liveLines: 0, listeners: 0, requests: 0, fail: true }
Object.assign(window, { mapTest: state })
function listener() {
  state.listeners++
  let live = true
  return { remove() { if (live) state.listeners--; live = false } }
}
class MapDouble {
  constructor(element: HTMLElement) { state.maps++; element.textContent = 'Map rendered' }
  addListener() { return listener() }
  fitBounds() {}
}
class LineDouble {
  live = true
  constructor() { state.liveLines++ }
  setMap(value: unknown) { if (!value && this.live) { this.live = false; state.liveLines-- } }
}
class MarkerDouble {
  live = true
  constructor() { state.liveMarkers++ }
  addListener() { return listener() }
  setMap(value: unknown) { if (!value && this.live) { this.live = false; state.liveMarkers-- } }
}
const libraries = {
  maps: { Map: MapDouble, Polyline: LineDouble },
  core: { LatLngBounds: class { extend() {} } },
  marker: { Marker: MarkerDouble },
  routes: { Route: { async computeRoutes(request: { intermediates: unknown[] }) {
    state.requests++
    // Fail the second segment after the first segment has produced overlays.
    if (state.fail && state.requests === 2) { state.fail = false; return { routes: [] } }
    const legs = Array.from({ length: request.intermediates.length + 1 }, (_, i) => ({
      startLocation: { lat: i, lng: i }, endLocation: { lat: i + 1, lng: i + 1 },
    }))
    return { routes: [{ path: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], legs }] }
  } } },
}
Object.assign(window, { google: { maps: { importLibrary: async (name: keyof typeof libraries) => libraries[name] } } })
const stops = Array.from({ length: 55 }, (_, i) => ({ id: `fixture-${i}`, name: `Fixture stop ${i}`, urdu: '' }))
const route: Route = { id: 'fixture', name: 'Fixture route', urdu: '', type: 'bus', status: '', firstStop: stops[0].id, lastStop: stops.at(-1)!.id }
const data: TransitData = { routes: [route], routeById: new Map([[route.id, route]]), stops, stopById: new Map(stops.map(stop => [stop.id, stop])), stopsOnRoute: { fixture: stops.map(stop => stop.id).join(',') }, routesOnStop: {} }
const root = createRoot(document.getElementById('root')!)
root.render(<GoogleRouteMap route={route} data={data} apiKey="fixture-not-a-real-key" />)
Object.assign(window, { unmountMapFixture: () => root.unmount() })
