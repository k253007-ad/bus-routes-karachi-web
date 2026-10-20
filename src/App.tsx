import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AnchorHTMLAttributes, FormEvent, ReactNode } from 'react'
import { busTypes, ids, loadData, loadPairs, routeImage, typeName } from './data'
import type { Route, Stop, TransitData } from './data'
import GoogleRouteMap from './GoogleRouteMap'

type Language = 'en' | 'ur' | 'mixed'
type Theme = 'light' | 'dark' | 'system' | 'coastal-light' | 'coastal-dark'
type Favorites = { routes: string[]; stops: string[] }
type AppState = {
  data: TransitData
  language: Language
  setLanguage: (language: Language) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  favorites: Favorites
  toggleFavorite: (kind: keyof Favorites, id: string) => void
  clearFavorites: () => void
}

const Context = createContext<AppState | null>(null)

function useApp() {
  const value = useContext(Context)
  if (!value) throw new Error('App data is unavailable')
  return value
}

function stored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

function go(path: string) {
  if (location.pathname + location.search === path) return
  history.pushState(null, '', path)
  window.dispatchEvent(new Event('brk:navigate'))
  window.scrollTo(0, 0)
}

function AppLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...props} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && href.startsWith('/')) {
      event.preventDefault()
      go(href)
    }
  }} />
}

function nameOf(item: Route | Stop | undefined, language: Language): string {
  if (!item) return 'Unknown stop'
  return language !== 'en' && item.urdu ? item.urdu : item.name
}

function Icons({ name, size = 23 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
    bus: <><rect x="4" y="3" width="16" height="16" rx="3" /><path d="M4 12h16M8 19v2m8-2v2M8 7h8" /></>,
    star: <path d="m12 2 3.1 6.3 7 .9-5.1 5 .9 7-5.9-3.2-5.9 3.2.9-7-5.1-5 7-.9z" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3l-.1.1V21h-2.6v-.2a1.7 1.7 0 0 0-1.3-1.6 1.7 1.7 0 0 0-1.3 1.6v.2H8.1v-2.5L8 18.4a1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9l-.1-.1H2v-2.6h.2a1.7 1.7 0 0 0 1.6-1.3A1.7 1.7 0 0 0 2.2 9.7H2V7.1h2.5l.1-.1a1.7 1.7 0 0 0-.3-1.9L4.2 5 6 3.2l.1.1A1.7 1.7 0 0 0 8 3.6l.1-.1V1h2.6v.2a1.7 1.7 0 0 0 1.3 1.6 1.7 1.7 0 0 0 1.3-1.6V1h2.6v2.5l.1.1a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 5l-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.1H22v2.6h-.2a1.7 1.7 0 0 0-1.6 1.3 1.7 1.7 0 0 0 1.6 1.3h.2v2.6h-2.5z" transform="translate(0 1) scale(.92)" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    route: <><path d="M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M8 15h5a6 6 0 0 0 6-6M3 4h7" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    swap: <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
    plus: <path d="M12 4v16M4 12h16" />,
    share: <><circle cx="18" cy="5" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m7 11 9-5m-9 7 9 5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 7 9-7" /></>,
    feedback: <><path d="M4 4h16v13H8l-4 3z" /><path d="M12 7v5m0 2v.1" /></>,
    data: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.info}</svg>
}

function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  const atHome = location.pathname === '/'
  return <header className="topbar">
    <div className="topbar-inner">
      {atHome ? <img className="topbar-logo" src="/images/app-icon.png" alt="" /> : <button className="icon-button topbar-back" type="button" onClick={() => history.length > 1 ? history.back() : go('/')} aria-label="Go back"><Icons name="back" /></button>}
      <span className="topbar-title">{title}</span>
      <span className="topbar-action">{action || <AppLink className="topbar-home" href="/">Home</AppLink>}</span>
    </div>
  </header>
}

const tabs = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/buses', label: 'Buses', icon: 'bus' },
  { href: '/favorites', label: 'Favorites', icon: 'star' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

function BottomNav() {
  const path = location.pathname
  return <nav className="bottom-nav" aria-label="Main sections">{tabs.map(tab => {
    const active = tab.href === '/' ? path === '/' : path === tab.href || path.startsWith(tab.href + '/') || (tab.href === '/buses' && path.startsWith('/route/'))
    return <AppLink href={tab.href} key={tab.href} aria-current={active ? 'page' : undefined}>
      <span className="bottom-icon"><Icons name={tab.icon} size={25} /></span><span>{tab.label}</span>
    </AppLink>
  })}</nav>
}

function FavoriteButton({ kind, id, className = '' }: { kind: keyof Favorites; id: string; className?: string }) {
  const { favorites, toggleFavorite, data, language } = useApp()
  const saved = favorites[kind].includes(id)
  const item = kind === 'routes' ? data.routeById.get(id) : data.stopById.get(id)
  return <button className={`favorite-button ${saved ? 'is-saved' : ''} ${className}`} type="button" aria-pressed={saved} aria-label={`${saved ? 'Remove saved' : 'Save'} ${nameOf(item, language)}`} onClick={event => { event.stopPropagation(); toggleFavorite(kind, id) }}><Icons name="star" size={22} /></button>
}

function RouteCard({ route, trip }: { route: Route; trip?: { from: Stop; to: Stop } }) {
  const { data, language } = useApp()
  const first = data.stopById.get(route.firstStop)
  const last = data.stopById.get(route.lastStop)
  return <article className="route-card">
    <AppLink href={`/route/${encodeURIComponent(route.id)}`} className="route-card-main">
      <span className="bus-thumb"><img src={routeImage(route)} alt="" loading="lazy" /></span>
      <span className="route-card-text"><strong>{nameOf(route, language)}</strong><small><Icons name="bus" size={15} /> {typeName(route.type)}</small>{trip ? <span className="route-card-journey">{nameOf(trip.from, language)} → {nameOf(trip.to, language)}</span> : <span className="route-card-journey">{nameOf(first, language)} → {nameOf(last, language)}</span>}</span>
    </AppLink>
    <FavoriteButton kind="routes" id={route.id} />
  </article>
}

function StopCard({ stop, routeId }: { stop: Stop; routeId?: string }) {
  const { data, language } = useApp()
  const route = routeId ? data.routeById.get(routeId) : undefined
  return <article className="stop-card">
    <AppLink href={`/stop/${stop.id}`} className="stop-card-main">
      {route ? <img src={routeImage(route)} alt="" loading="lazy" /> : <span className="stop-marker"><Icons name="pin" /></span>}
      <strong>{nameOf(stop, language)}</strong>
    </AppLink>
    <FavoriteButton kind="stops" id={stop.id} />
  </article>
}

function FeaturePanel({ title, icon, image, button, href }: { title: string; icon: string; image: string; button: string; href: string }) {
  return <section className="feature-panel"><h2><Icons name={icon} />{title}</h2><img src={`/images/${image}`} alt="" loading="lazy" /><AppLink className="wide-button" href={href}>{button}</AppLink></section>
}

function Dashboard() {
  const { data } = useApp()
  return <>
    <PageHeader title="DashBoard" action={<AppLink className="topbar-home" href="/settings">Settings</AppLink>} />
    <main id="main-content" className="screen dashboard">
      <section className="dashboard-hero">
        <img src="/images/img_busses_banner.svg" alt="Karachi bus types" className="dashboard-banner" />
        <h1>Bus Routes Karachi</h1><p>Bus Route App</p>
        <div className="stats-row"><AppLink href="/buses"><Icons name="bus" /><strong>{data.routes.length}</strong><span>Routes</span></AppLink><AppLink href="/stops"><Icons name="data" /><strong>{data.stops.length}</strong><span>Stops</span></AppLink></div>
      </section>
      <div className="dashboard-content">
        <div className="community-message"><span aria-hidden="true">♥</span><div><strong>Made by Bus Lovers ❤️</strong><small>Community-driven data for Karachi commuters</small></div></div>
        <section className="feature-panel"><h2><Icons name="bus" />Find by Bus Type</h2><div className="bus-type-strip">{busTypes.map(type => <AppLink href={`/buses/${type.id}`} key={type.id} aria-label={type.name}><img src={`/images/${type.image}`} alt="" /><span>{type.name}</span></AppLink>)}</div><AppLink className="wide-button" href="/buses">See All Buses</AppLink></section>
        <FeaturePanel title="Plan a Route" icon="route" image="start_stop_poll.svg" button="Get Bus Suggestions" href="/plan" />
        <FeaturePanel title="Add Missing Route" icon="plus" image="start_stop_poll.svg" button="Contribute a Route" href="/add-route" />
        <FeaturePanel title="Buses at a Stop" icon="pin" image="img_buses_on_route.svg" button="Find Buses at Stop" href="/stops" />
        <section className="feature-panel"><h2><Icons name="data" />More Options</h2><div className="quick-grid">{[
          ['/settings', 'Settings', 'settings'], ['/contact', 'Contact', 'mail'], ['/feedback', 'Feedback', 'feedback'], ['/about', 'About', 'info'], ['/feedback?type=route', 'Route Data Issues', 'pin'], ['/experience', 'Share Experience', 'feedback'], ['/share', 'Share App', 'share'], ['/data', 'View Data', 'data'],
        ].map(([href, label, icon]) => <AppLink href={href} key={href}><Icons name={icon} /><span>{label}</span></AppLink>)}</div></section>
      </div>
    </main>
  </>
}

function BusList({ type }: { type?: string }) {
  const { data, language } = useApp()
  const [query, setQuery] = useState('')
  const routes = useMemo(() => data.routes.filter(route => (!type || route.type === type) && (!query || `${route.name} ${route.urdu} ${route.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [data.routes, type, query])
  return <>
    <PageHeader title={type ? typeName(type) : 'All Buses'} />
    <main id="main-content" className="screen content-screen">
      <div className="screen-intro"><h1>{type ? typeName(type) : 'All Buses'}</h1><p>{type ? `Explore ${typeName(type).toLowerCase()} routes across Karachi.` : 'Choose a bus type or search all routes.'}</p></div>
      {!type && <section className="type-grid" aria-label="Bus types">{busTypes.map(item => <AppLink href={`/buses/${item.id}`} className="type-card" key={item.id}><img src={`/images/${item.image}`} alt="" loading="lazy" /><strong>{item.name}</strong><small>{data.routes.filter(route => route.type === item.id).length} routes</small></AppLink>)}</section>}
      <div className="quick-links"><AppLink href="/plan"><Icons name="route" />Plan a Route</AppLink><AppLink href="/stops"><Icons name="pin" />Buses at a Stop</AppLink></div>
      <section className="list-section"><div className="list-heading"><h2>{type ? `${typeName(type)} Routes` : 'All Routes'}</h2><span>{routes.length} routes</span></div><label className="search-field"><Icons name="search" /><span className="sr-only">Search buses</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by bus name or number" autoComplete="off" /></label>
        <div className="route-list">{routes.length ? routes.map(route => <RouteCard key={route.id} route={route} />) : <div className="empty-state">No buses match your search. Try another name or number.</div>}</div>
      </section>
      {language === 'ur' && <p className="language-note">بسوں کے نام اردو میں دکھائے جا رہے ہیں۔</p>}
    </main>
  </>
}

function StopPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const { data, language } = useApp()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  const results = useMemo(() => data.stops.filter(stop => !query || `${stop.name} ${stop.urdu}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 60), [data.stops, query])
  return <>
    <button type="button" className="stop-select" onClick={() => { setQuery(''); setOpen(true) }} aria-label={`${label}: ${value ? nameOf(data.stopById.get(value), language) : 'Choose a stop'}`}><span><small>{label}</small><strong>{value ? nameOf(data.stopById.get(value), language) : 'Choose a stop'}</strong></span><Icons name="search" size={21} /></button>
    <dialog ref={dialog} className="stop-dialog" onClose={() => setOpen(false)} aria-label={`Choose ${label.toLowerCase()}`}>
      <div className="dialog-header"><h2>Choose {label.toLowerCase()}</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close stop picker">×</button></div>
      <label className="search-field"><Icons name="search" /><span className="sr-only">Search stops</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search stop name" autoComplete="off" /></label>
      <div className="stop-options">{results.length ? results.map(stop => <button type="button" key={stop.id} onClick={() => { onChange(stop.id); setOpen(false) }}><Icons name="pin" size={20} /><span>{nameOf(stop, language)}<small>{stop.id}</small></span></button>) : <p className="empty-state">No stop found. Try a different spelling.</p>}</div>
    </dialog>
  </>
}

function PlanPage() {
  const { data, language } = useApp()
  const params = new URLSearchParams(location.search)
  const [from, setFrom] = useState(params.get('from') || '')
  const [to, setTo] = useState(params.get('to') || '')
  const [routes, setRoutes] = useState<Route[] | null>(null)
  const [error, setError] = useState('')
  async function find() {
    if (!from || !to) { setError('Choose both stops to find a bus.'); return }
    if (from === to) { setError('Choose two different stops.'); return }
    setError('')
    try {
      const pairs = await loadPairs()
      setRoutes(ids(pairs[`${from}-${to}`]).map(id => data.routeById.get(id)).filter((route): route is Route => Boolean(route)))
      history.replaceState(null, '', `/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    } catch { setError('Route suggestions could not load. Try again.') }
  }
  useEffect(() => { if (from && to) void find() }, []) // Restore shared journey URLs on first load.
  const fromStop = data.stopById.get(from)
  const toStop = data.stopById.get(to)
  return <><PageHeader title="Bus Suggestion" /><main id="main-content" className="screen content-screen">
    <div className="screen-intro"><h1>Get Bus Suggestions</h1><p>Choose where your trip starts and ends.</p></div>
    <section className="planner-card"><StopPicker label="From stop" value={from} onChange={id => { setFrom(id); setRoutes(null) }} /><button type="button" className="swap-action" onClick={() => { setFrom(to); setTo(from); setRoutes(null) }} aria-label="Swap stops"><Icons name="swap" />Swap stops</button><StopPicker label="To stop" value={to} onChange={id => { setTo(id); setRoutes(null) }} /><button className="wide-button" type="button" onClick={() => void find()}>Find Buses</button>{error && <p className="form-error" role="alert">{error}</p>}</section>
    {routes && <section className="list-section"><div className="list-heading"><h2>{fromStop && toStop ? `${nameOf(fromStop, language)} → ${nameOf(toStop, language)}` : 'Suggested Buses'}</h2><span>{routes.length} direct {routes.length === 1 ? 'bus' : 'buses'}</span></div><div className="route-list">{routes.length ? routes.map(route => <RouteCard key={route.id} route={route} trip={fromStop && toStop ? { from: fromStop, to: toStop } : undefined} />) : <div className="empty-state">No direct bus was found. Try a nearby stop or browse all buses.</div>}</div></section>}
    <AppLink href="/buses" className="text-link">Browse all buses</AppLink>
  </main></>
}

function StopsPage() {
  const { data, language } = useApp()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const matching = useMemo(() => data.stops.filter(stop => !query || `${stop.name} ${stop.urdu} ${stop.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 80), [data.stops, query])
  return <><PageHeader title="Buses On Stop" /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>Find Buses at a Stop</h1><p>Select a stop to see every bus that serves it.</p></div><section className="planner-card"><StopPicker label="Stop" value={selected} onChange={id => { setSelected(id); go(`/stop/${id}`) }} /></section><div className="list-heading"><h2>All Stops</h2><span>{data.stops.length} stops</span></div><label className="search-field"><Icons name="search" /><span className="sr-only">Search stops</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search stops" autoComplete="off" /></label><div className="stop-list-grid">{matching.map(stop => <StopCard key={stop.id} stop={stop} />)}</div>{matching.length === 80 && <p className="list-note">Showing the first 80 stops. Search to narrow the list.</p>}{!matching.length && <p className="empty-state">No stop matches that name.</p>}{language === 'ur' && <p className="language-note">اسٹاپ کے نام اردو میں دکھائے جا رہے ہیں۔</p>}</main></>
}

function StopDetail({ id }: { id: string }) {
  const { data, language } = useApp()
  const stop = data.stopById.get(id)
  if (!stop) return <NotFound />
  const routes = ids(data.routesOnStop[id]).map(routeId => data.routeById.get(routeId)).filter((route): route is Route => Boolean(route))
  return <><PageHeader title="Buses On Stop" action={<FavoriteButton kind="stops" id={id} />} /><main id="main-content" className="screen content-screen"><div className="detail-hero"><span className="detail-icon"><Icons name="pin" size={32} /></span><div><small>Bus stop</small><h1>{nameOf(stop, language)}</h1>{language !== 'en' && <p>{stop.name}</p>}</div></div><div className="list-heading"><h2>Routes at this Stop</h2><span>{routes.length} buses</span></div><div className="route-list">{routes.length ? routes.map(route => <RouteCard key={route.id} route={route} />) : <p className="empty-state">No routes are listed for this stop.</p>}</div><AppLink href="/stops" className="text-link">Choose another stop</AppLink></main></>
}

function RouteDetail({ id }: { id: string }) {
  const { data, language } = useApp()
  const route = data.routeById.get(id)
  if (!route) return <NotFound />
  const first = data.stopById.get(route.firstStop)
  const last = data.stopById.get(route.lastStop)
  const count = ids(data.stopsOnRoute[id]).length
  return <>
    <PageHeader title="Bus Details" action={<a className="topbar-home" href="#route-map">Map</a>} />
    <main id="main-content" className="screen content-screen">
      <section className="route-detail-card"><div className="detail-card-top"><span>Route Details</span><FavoriteButton kind="routes" id={id} /></div><div className="route-identity"><img src={routeImage(route)} alt={`${typeName(route.type)} illustration`} /><div><h1>{nameOf(route, language)}</h1>{route.urdu && language === 'en' && <p lang="ur" dir="rtl">{route.urdu}</p>}<span className="type-pill"><Icons name="star" size={16} />{typeName(route.type)}</span></div></div></section>
      <section className="journey-panel"><h2>Route Journey</h2><div className="journey-point"><span><Icons name="pin" /></span><div><small>Starting Point</small><strong>{nameOf(first, language)}</strong></div></div><div className="journey-line" /><div className="journey-point end"><span><Icons name="pin" /></span><div><small>Destination</small><strong>{nameOf(last, language)}</strong></div></div><AppLink href={`/route/${id}/stops`} className="wide-button secondary">View All {count} Stops</AppLink></section>
      <section className="detail-actions" aria-label="Route actions"><AppLink href={`/route/${id}/reviews`}><Icons name="star" />Reviews</AppLink><AppLink href={`/feedback?type=route&route=${encodeURIComponent(id)}`}><Icons name="feedback" />Report Issue</AppLink><button type="button" onClick={() => sharePage(route.name)}><Icons name="share" />Share</button></section>
      <GoogleRouteMap key={route.id} route={route} data={data} />
    </main>
  </>
}

function RouteStops({ id }: { id: string }) {
  const { data, language } = useApp()
  const route = data.routeById.get(id)
  if (!route) return <NotFound />
  const stops = ids(data.stopsOnRoute[id]).map(stopId => data.stopById.get(stopId)).filter((stop): stop is Stop => Boolean(stop))
  return <><PageHeader title="Show Stops" action={<button className="topbar-home" type="button" onClick={() => sharePage(`${route.name} stops`)}>Share</button>} /><main id="main-content" className="screen content-screen"><div className="route-stops-heading"><img src={routeImage(route)} alt="" /><div><small>Route</small><h1>{nameOf(route, language)}</h1></div></div><div className="list-heading"><h2>All Stops</h2><span>{stops.length} stops</span></div><div className="stop-list-grid">{stops.map((stop, index) => <div key={stop.id} className="numbered-stop"><span>{index + 1}</span><StopCard stop={stop} routeId={id} /></div>)}</div></main></>
}

function FavoritesPage() {
  const { data, favorites } = useApp()
  const [tab, setTab] = useState<'routes' | 'stops'>('routes')
  const routes = favorites.routes.map(id => data.routeById.get(id)).filter((route): route is Route => Boolean(route))
  const stops = favorites.stops.map(id => data.stopById.get(id)).filter((stop): stop is Stop => Boolean(stop))
  return <><PageHeader title="Favorites" /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>Your Favorites</h1><p>Saved buses and stops stay on this device.</p></div><div className="segmented" role="tablist" aria-label="Saved items"><button type="button" role="tab" aria-selected={tab === 'routes'} onClick={() => setTab('routes')}>Buses ({routes.length})</button><button type="button" role="tab" aria-selected={tab === 'stops'} onClick={() => setTab('stops')}>Stops ({stops.length})</button></div>{tab === 'routes' ? <div className="route-list">{routes.length ? routes.map(route => <RouteCard route={route} key={route.id} />) : <div className="empty-state"><strong>No saved buses yet</strong><p>Open a bus and tap its star to save it here.</p><AppLink href="/buses">Browse buses</AppLink></div>}</div> : <div className="stop-list-grid">{stops.length ? stops.map(stop => <StopCard stop={stop} key={stop.id} />) : <div className="empty-state"><strong>No saved stops yet</strong><p>Tap the star beside a stop to save it here.</p><AppLink href="/stops">Browse stops</AppLink></div>}</div>}</main></>
}

function SettingsPage() {
  const { language, setLanguage, theme, setTheme, clearFavorites } = useApp()
  const [cleared, setCleared] = useState(false)
  const languageOptions: [Language, string][] = [['en', 'English'], ['ur', 'اردو (Urdu)'], ['mixed', 'Stops & Buses in اردو']]
  const themeOptions: [Theme, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System Default'], ['coastal-light', 'Custom Light'], ['coastal-dark', 'Custom Dark']]
  return <><PageHeader title="Setting" /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>Settings</h1><p>Choose how the app looks and displays route names.</p></div><section className="settings-card"><h2>Language</h2>{languageOptions.map(([value, label]) => <button type="button" className={`choice ${language === value ? 'selected' : ''}`} key={value} onClick={() => setLanguage(value)}><Icons name="globe" /><span>{label}</span>{language === value && <span className="check">✓</span>}</button>)}</section><section className="settings-card"><h2>Theme</h2>{themeOptions.map(([value, label]) => <button type="button" className={`choice ${theme === value ? 'selected' : ''}`} key={value} onClick={() => setTheme(value)}><Icons name="settings" /><span>{label}</span>{theme === value && <span className="check">✓</span>}</button>)}</section><section className="settings-card"><h2>Data & Privacy</h2><p>Favorites and display preferences are stored in this browser. Route data is bundled with the website.</p><button className="outline-button" type="button" onClick={() => { if (confirm('Remove all saved routes and stops?')) { clearFavorites(); setCleared(true) } }}>Clear Saved Items</button>{cleared && <p className="success-message" role="status">Saved items removed.</p>}<div className="settings-links"><AppLink href="/data">View Data</AppLink><AppLink href="/about">About</AppLink><AppLink href="/privacy">Privacy</AppLink><AppLink href="/contact">Contact</AppLink></div></section></main></>
}

function MapPage({ id }: { id: string }) {
  const { data, language } = useApp()
  const route = data.routeById.get(id)
  if (!route) return <NotFound />
  return <><PageHeader title="Route Map" /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>{nameOf(route, language)} Map</h1></div><GoogleRouteMap key={route.id} route={route} data={data} /><AppLink href={`/route/${id}/stops`} className="text-link">View all listed stops</AppLink></main></>
}

function InfoPage({ kind }: { kind: 'about' | 'privacy' | 'data' | 'share' | 'contact' }) {
  const { data } = useApp()
  const title = { about: 'About', privacy: 'Privacy', data: 'View Data', share: 'Share App', contact: 'Contact Us' }[kind]
  return <><PageHeader title={title} /><main id="main-content" className="screen content-screen"><article className="info-card"><h1>{title}</h1>{kind === 'about' && <><p>Bus Routes Karachi helps people find routes and stops across the city. This website follows the Android app’s public screens and uses its original bus artwork.</p><p>Find buses between stops, browse by type, view every stop on a route, and save the places you use often.</p><p>The local route snapshot is not a live timetable or vehicle tracker. Confirm important journeys locally because services can change.</p></>}{kind === 'privacy' && <><p>Route searches run in your browser using the bundled data. Favorites, language, and theme are stored in this browser’s local storage.</p><p>This website does not require an account or track your location. Opening Google Maps or your email app uses those services’ own privacy policies.</p></>}{kind === 'data' && <><p><strong>{data.routes.length}</strong> routes and <strong>{data.stops.length}</strong> stops are included in the local data snapshot.</p><p>Route and stop files can be downloaded below. They contain names and route connections, not live positions or times.</p><div className="settings-links"><a href="/data/routes.json" download>Routes data</a><a href="/data/stops.json" download>Stops data</a></div></>}{kind === 'share' && <><p>Share Bus Routes Karachi with another commuter.</p><button className="wide-button" type="button" onClick={() => sharePage('Bus Routes Karachi')}>Share App</button></>}{kind === 'contact' && <><p>Found an error or have a question? Email the project team.</p><a className="wide-button" href="mailto:droidclics@gmail.com">Email Droid Clics</a></>}</article></main></>
}

function ContributionPage({ type }: { type: 'route' | 'feedback' | 'experience' | 'review'; routeId?: string }) {
  const title = { route: 'Add Missing Route', feedback: 'Feedback', experience: 'Share Experience', review: 'Route Review' }[type]
  const [name, setName] = useState('')
  const [busType, setBusType] = useState('bus')
  const [details, setDetails] = useState('')
  const [rating, setRating] = useState(5)
  const [error, setError] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!details.trim() || (type === 'route' && !name.trim())) { setError('Enter the requested details before continuing.'); return }
    const subject = type === 'route' ? `Route suggestion: ${name}` : `${title} for Bus Routes Karachi`
    const body = [`Name: ${name || 'Not provided'}`, `Bus type: ${typeName(busType)}`, `Rating: ${rating}/5`, '', details].join('\n')
    location.href = `mailto:droidclics@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }
  return <><PageHeader title={title} /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>{title}</h1><p>{type === 'route' ? 'Help the community by sharing a route missing from the list.' : 'Tell the project team what happened or what should be improved.'}</p></div><form className="contribution-card" onSubmit={submit}>{type === 'route' && <><label>Bus or route name<input value={name} onChange={event => setName(event.target.value)} placeholder="For example, Route 10" maxLength={100} /></label><label>Bus type<select value={busType} onChange={event => setBusType(event.target.value)}>{busTypes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></>}{(type === 'experience' || type === 'review') && <label>Rating<select value={rating} onChange={event => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} stars</option>)}</select></label>}<label>{type === 'route' ? 'Stops and other details' : 'Your message'}<textarea value={details} onChange={event => setDetails(event.target.value)} rows={7} maxLength={3000} placeholder={type === 'route' ? 'List the starting point, destination, and stops you know.' : 'Write the details here.'} /></label>{error && <p className="form-error" role="alert">{error}</p>}<p className="form-help">Continue opens your email app with these details ready to send.</p><button type="submit" className="wide-button">Continue to Email</button></form></main></>
}

function ReviewsPage({ id }: { id: string }) {
  const { data } = useApp()
  const route = data.routeById.get(id)
  if (!route) return <NotFound />
  return <><PageHeader title="Route Reviews" /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>{route.name} Reviews</h1><p>Share your experience with this route.</p></div><div className="empty-state"><strong>Live reviews are unavailable on this website</strong><p>You can still send your experience to the project team.</p><AppLink href="/experience">Share Experience</AppLink></div></main></>
}

function NotFound() {
  return <><PageHeader title="Not Found" /><main id="main-content" className="screen content-screen"><div className="empty-state"><h1>Page not found</h1><p>The route or stop may have changed.</p><AppLink href="/">Go Home</AppLink></div></main></>
}

async function sharePage(title: string) {
  if (navigator.share) {
    try { await navigator.share({ title, url: location.href }); return } catch { /* Share sheet was dismissed. */ }
  }
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(location.href); alert('Link copied to clipboard.') } catch { /* Browser clipboard unavailable. */ }
  }
}

function ScreenRouter() {
  const path = location.pathname
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return <Dashboard />
  if (parts[0] === 'buses') return <BusList type={parts[1]} />
  if (parts[0] === 'plan') return <PlanPage />
  if (parts[0] === 'stops') return <StopsPage />
  if (parts[0] === 'stop' && parts[1]) return <StopDetail id={decodeURIComponent(parts[1])} />
  if (parts[0] === 'route' && parts[1]) {
    const id = decodeURIComponent(parts[1])
    if (parts[2] === 'stops') return <RouteStops id={id} />
    if (parts[2] === 'map') return <MapPage id={id} />
    if (parts[2] === 'reviews') return <ReviewsPage id={id} />
    return <RouteDetail id={id} />
  }
  if (parts[0] === 'favorites') return <FavoritesPage />
  if (parts[0] === 'settings') return <SettingsPage />
  if (parts[0] === 'add-route') return <ContributionPage type="route" />
  if (parts[0] === 'feedback') return <ContributionPage type="feedback" />
  if (parts[0] === 'experience') return <ContributionPage type="experience" />
  if (parts[0] === 'about' || parts[0] === 'privacy' || parts[0] === 'data' || parts[0] === 'share' || parts[0] === 'contact') return <InfoPage kind={parts[0]} />
  return <NotFound />
}

export default function App() {
  const [data, setData] = useState<TransitData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [path, setPath] = useState(location.pathname + location.search)
  const [language, updateLanguage] = useState<Language>(() => stored('brk-web-language', 'en'))
  const [theme, updateTheme] = useState<Theme>(() => stored('brk-web-theme', 'light'))
  const [favorites, setFavorites] = useState<Favorites>(() => stored('brk-web-favorites', { routes: [], stops: [] }))

  useEffect(() => {
    let active = true
    loadData().then(value => { if (active) setData(value) }).catch(() => { if (active) setLoadError('Route data could not load. Refresh the page to try again.') })
    const update = () => setPath(location.pathname + location.search)
    window.addEventListener('popstate', update)
    window.addEventListener('brk:navigate', update)
    return () => { active = false; window.removeEventListener('popstate', update); window.removeEventListener('brk:navigate', update) }
  }, [])

  useEffect(() => {
    const effective = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
    document.documentElement.dataset.theme = effective
    document.documentElement.lang = language === 'ur' ? 'ur' : 'en'
    localStorage.setItem('brk-web-theme', JSON.stringify(theme))
  }, [theme, language])

  function setLanguage(value: Language) { updateLanguage(value); localStorage.setItem('brk-web-language', JSON.stringify(value)) }
  function setTheme(value: Theme) { updateTheme(value) }
  function toggleFavorite(kind: keyof Favorites, id: string) {
    setFavorites(previous => {
      const list = previous[kind]
      const next = { ...previous, [kind]: list.includes(id) ? list.filter(item => item !== id) : [...list, id] }
      localStorage.setItem('brk-web-favorites', JSON.stringify(next))
      return next
    })
  }
  function clearFavorites() {
    const empty = { routes: [], stops: [] }
    setFavorites(empty)
    localStorage.setItem('brk-web-favorites', JSON.stringify(empty))
  }

  if (loadError) return <div className="startup-message" role="alert"><img src="/images/app-icon.png" alt="" /><h1>Bus Routes Karachi</h1><p>{loadError}</p><button type="button" onClick={() => location.reload()}>Try Again</button></div>
  if (!data) return <div className="startup-message" role="status"><img src="/images/app-icon.png" alt="" /><h1>Bus Routes Karachi</h1><p>Loading routes and stops…</p></div>

  const value: AppState = { data, language, setLanguage, theme, setTheme, favorites, toggleFavorite, clearFavorites }
  return <Context.Provider value={value}><a className="skip-link" href="#main-content">Skip to content</a><div className="app-shell" data-path={path}><ScreenRouter /><BottomNav /></div></Context.Provider>
}
