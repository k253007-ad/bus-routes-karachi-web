import { useEffect, useMemo, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { ids, type Route, type Stop, type TransitData } from './data'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
let loaderConfigured = false

function place(stop: Stop) {
  return `${stop.name}, Karachi, Pakistan`
}

// Maps URLs accept only three intermediate stops on mobile browsers.
// The site map below still plots the complete stop sequence when configured.
function directionsUrl(stops: Stop[]) {
  if (stops.length < 2) return ''
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', place(stops[0]))
  url.searchParams.set('destination', place(stops[stops.length - 1]))
  const middle = stops.slice(1, -1)
  const waypoints = middle.length <= 3
    ? middle
    : [1, 2, 3].map(part => stops[Math.round(part * (stops.length - 1) / 4)])
  if (waypoints.length) url.searchParams.set('waypoints', waypoints.map(place).join('|'))
  url.searchParams.set('travelmode', 'driving')
  return url.toString()
}

export default function GoogleRouteMap({ route, data }: { route: Route; data: TransitData }) {
  const stops = useMemo(() => ids(data.stopsOnRoute[route.id])
    .map(id => data.stopById.get(id))
    .filter((stop): stop is Stop => Boolean(stop)), [data.stopById, data.stopsOnRoute, route.id])
  const mapElement = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(GOOGLE_MAPS_KEY && stops.length > 1 ? 'loading' : 'error')
  const [stopQuery, setStopQuery] = useState('')
  const url = useMemo(() => directionsUrl(stops), [stops])
  const visibleStops = stops.map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => stop.name.toLocaleLowerCase().includes(stopQuery.trim().toLocaleLowerCase()))

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !mapElement.current || stops.length < 2) return
    let active = true
    const lines: google.maps.Polyline[] = []
    const markers: google.maps.Marker[] = []

    async function renderMap() {
      if (!loaderConfigured) {
        setOptions({ key: GOOGLE_MAPS_KEY!, v: 'weekly', region: 'PK' })
        loaderConfigured = true
      }
      const [maps, core, markerLibrary, routesLibrary] = await Promise.all([
        importLibrary('maps'), importLibrary('core'), importLibrary('marker'), importLibrary('routes'),
      ])
      if (!active || !mapElement.current) return
      const map = new maps.Map(mapElement.current, {
        center: { lat: 24.8607, lng: 67.0011 },
        zoom: 11,
        disableDefaultUI: true,
        gestureHandling: 'none',
        keyboardShortcuts: false,
        clickableIcons: false,
      })
      const openMaps = () => window.open(url, '_blank', 'noopener,noreferrer')
      map.addListener('click', openMaps)
      const bounds = new core.LatLngBounds()

      // Keep all routes on one map while staying within Google's request limit.
      const parts = Array.from({ length: Math.ceil((stops.length - 1) / 26) }, (_, index) => {
        const start = index * 26
        return { start, stops: stops.slice(start, start + 27) }
      })
      const responses = await Promise.all(parts.map(({ stops: part }) => routesLibrary.Route.computeRoutes({
          origin: place(part[0]),
          destination: place(part[part.length - 1]),
          intermediates: part.slice(1, -1).map(stop => ({ location: place(stop) })),
          travelMode: 'DRIVING',
          region: 'pk',
          fields: ['path', 'legs'],
        })))
      for (const [partIndex, { start, stops: part }] of parts.entries()) {
        if (!active) return
        const response = responses[partIndex]
        const result = response.routes?.[0]
        const legs = result?.legs
        if (!result?.path?.length || !legs || legs.length !== part.length - 1) throw new Error('Route map unavailable')
        const path = result.path.map(point => ({ lat: point.lat, lng: point.lng }))
        const line = new maps.Polyline({ map, path, strokeColor: '#216fc5', strokeWeight: 5, strokeOpacity: .9 })
        lines.push(line)
        path.forEach(point => bounds.extend(point))

        const locations = [legs[0].startLocation, ...legs.map(leg => leg.endLocation)]
        if (locations.some(location => !location)) throw new Error('Stop locations unavailable')
        locations.forEach((location, index) => {
          if (!location || (start > 0 && index === 0)) return
          const stop = part[index]
          const pin = new markerLibrary.Marker({
            map,
            position: { lat: location.lat, lng: location.lng },
            label: String(start + index + 1),
            title: `${start + index + 1}. ${stop.name}`,
          })
          pin.addListener('click', openMaps)
          markers.push(pin)
        })
      }
      map.fitBounds(bounds, 28)
      setStatus('ready')
    }

    void renderMap().catch(() => {
      lines.forEach(line => line.setMap(null))
      markers.forEach(marker => marker.setMap(null))
      if (active) setStatus('error')
    })
    return () => {
      active = false
      lines.forEach(line => line.setMap(null))
      markers.forEach(marker => marker.setMap(null))
    }
  }, [stops, url])

  return <section className="embedded-map-card" id="route-map" aria-label="Route map">
    <div className="map-card-heading"><div><h2>Route map</h2><p>{stops[0]?.name} to {stops[stops.length - 1]?.name}</p></div><span>{stops.length} stops</span></div>
    {GOOGLE_MAPS_KEY && status !== 'error' && <div className={`full-route-map ${status === 'ready' ? 'is-ready' : ''}`} ref={mapElement} aria-label={`${route.name} route map`} />}
    {status === 'loading' && <div className="full-map-message" role="status">Loading route map...</div>}
    {status === 'error' && <a className="map-fallback-button" href={url || undefined} target="_blank" rel="noopener noreferrer"><span className="map-fallback-route"><strong>{stops[0]?.name}</strong><span className="map-fallback-line" aria-hidden="true" /><strong>{stops[stops.length - 1]?.name}</strong></span><span className="map-fallback-action">View route in Google Maps <span aria-hidden="true">↗</span></span></a>}
    {status === 'ready' && <a className="wide-button map-open-button" href={url} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}
    <div className="map-stops-heading"><div><h3>All stops</h3><p>In route order</p></div>{stops.length > 8 && <label className="map-stop-search"><span className="sr-only">Find a stop on this route</span><input type="search" placeholder="Find a stop" value={stopQuery} onChange={event => setStopQuery(event.target.value)} /></label>}</div>
    <ol className="map-all-stops">{visibleStops.map(({ stop, index }) => <li key={`${stop.id}-${index}`}><span className={`map-stop-number ${index === 0 || index === stops.length - 1 ? 'terminal' : ''}`}>{index + 1}</span><span className="map-stop-name">{stop.name}</span>{index === 0 && <small>Start</small>}{index === stops.length - 1 && <small>End</small>}</li>)}</ol>
    {visibleStops.length === 0 && <p className="map-no-stops">No stops match “{stopQuery}”.</p>}
  </section>
}
