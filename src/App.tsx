import { createContext, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { busTypes, ids, loadData, findDirectRoutes, refreshData, subscribeData, getDataSyncStatus, subscribeDataSync, routeImage, typeName } from './data'
import type { Route, Stop, TransitData } from './data'
import GoogleRouteMap from './GoogleRouteMap'
import { ContributionForm, ReviewComposer, ReviewsPanel } from './BackendForms'
import { pathId, savedFavorites } from './inputSafety'
import { sharePage } from './sharing'
import { watchSystemTheme } from './systemTheme'
import { installPressFeedback } from './pressFeedback'
import reviewedRoutes from './routeUpdates2026.json'

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

function routeCountLabel(count: number) {
  return `${count} route${count === 1 ? '' : 's'}`
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
    check: <path d="m5 12 4 4L19 6" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.info}</svg>
}

function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  const atHome = location.pathname === '/'
  return <header className="topbar">
    <div className="topbar-inner">
      {atHome ? <img className="topbar-logo" src="/images/ic_konsi_bus_karachi.svg" alt="" /> : <button className="icon-button topbar-back" type="button" onClick={() => history.length > 1 ? history.back() : go('/')} aria-label="Go back"><Icons name="back" /></button>}
      <span className="topbar-title">{title}</span>
      <span className="topbar-action">{action || <AppLink className="topbar-home" href="/">Home</AppLink>}</span>
    </div>
  </header>
}

const tabs = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/plan', label: 'Plan Trip', icon: 'route' },
  { href: '/buses', label: 'Buses', icon: 'bus' },
  { href: '/stops', label: 'Stops', icon: 'pin' },
  { href: '/favorites', label: 'Saved', icon: 'star' },
]

function BottomNav() {
  const path = location.pathname
  return <nav className="bottom-nav" aria-label="Main sections">{tabs.map(tab => {
    const active = tab.href === '/' ? path === '/' : path === tab.href || path.startsWith(tab.href + '/') || (tab.href === '/buses' && path.startsWith('/route/')) || (tab.href === '/stops' && path.startsWith('/stop/'))
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
  return <article className="route-card motion-reveal">
    <AppLink href={`/route/${encodeURIComponent(route.id)}`} className="route-card-main">
      <span className="bus-thumb"><img src={routeImage(route)} alt="" loading="lazy" /></span>
      <span className="route-card-text"><strong>{nameOf(route, language)}</strong><small><Icons name="bus" size={15} /> {typeName(route.type)}</small>{trip ? <span className="route-card-journey">{nameOf(trip.from, language)} → {nameOf(trip.to, language)}</span> : <span className="route-card-journey">{nameOf(first, language)} → {nameOf(last, language)}</span>}</span>
    </AppLink>
    <FavoriteButton kind="routes" id={route.id} />
  </article>
}

function DetailedRouteCard({ route }: { route: Route }) {
  const { data, language } = useApp()
  const first = data.stopById.get(route.firstStop)
  const last = data.stopById.get(route.lastStop)
  const stopCount = ids(data.stopsOnRoute[route.id]).length
  return <article className="detailed-route-card motion-reveal">
    <AppLink href={`/route/${encodeURIComponent(route.id)}`} className="detailed-route-link">
      <span className="detailed-route-art"><img src={routeImage(route)} alt="" loading="lazy" /></span>
      <span className="detailed-route-content">
        <span className="detailed-route-type">{typeName(route.type)}</span>
        <strong className="detailed-route-name">{nameOf(route, language)}</strong>
        {stopCount > 0 && <span className="detailed-route-count">{stopCount} {stopCount === 1 ? 'stop' : 'stops'} listed</span>}
      </span>
      <span className="detailed-route-journey"><span className="detailed-route-point"><small>From</small><strong>{nameOf(first, language)}</strong></span><span className="detailed-route-arrow" aria-hidden="true">→</span><span className="detailed-route-point"><small>To</small><strong>{nameOf(last, language)}</strong></span></span>
    </AppLink>
    <FavoriteButton kind="routes" id={route.id} />
  </article>
}

function StopCard({ stop, routeId }: { stop: Stop; routeId?: string }) {
  const { data, language } = useApp()
  const route = routeId ? data.routeById.get(routeId) : undefined
  return <article className="stop-card motion-reveal">
    <AppLink href={`/stop/${stop.id}`} className="stop-card-main">
      {route ? <img src={routeImage(route)} alt="" loading="lazy" /> : <span className="stop-marker"><Icons name="pin" /></span>}
      <strong>{nameOf(stop, language)}</strong>
    </AppLink>
    <FavoriteButton kind="stops" id={stop.id} />
  </article>
}

function Dashboard() {
  const { data, language } = useApp()
  const [query, setQuery] = useState('')
  const search = useDeferredValue(query.trim().toLocaleLowerCase())
  const results = useMemo(() => search ? {
    routes: data.routes.filter(route => `${route.name} ${route.urdu} ${route.id}`.toLocaleLowerCase().includes(search)).slice(0, 4),
    stops: data.stops.filter(stop => `${stop.name} ${stop.urdu}`.toLocaleLowerCase().includes(search)).slice(0, 3),
  } : { routes: [], stops: [] }, [data, search])
  return <>
    <PageHeader title="Konsi Bus Karachi" action={<AppLink className="topbar-home" href="/settings"><Icons name="settings" size={19} /> Settings</AppLink>} />
    <main id="main-content" className="screen dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-welcome">
          <h1>Find your bus in Karachi</h1>
          <p>Choose two stops to plan a trip, or look up a bus by name.</p>
          <div className="hero-actions"><AppLink className="wide-button" href="/plan"><Icons name="route" size={20} /> Plan a Trip</AppLink><AppLink className="wide-button secondary" href="/buses"><Icons name="bus" size={20} /> Browse Buses</AppLink></div>
        </div>
        <div className="dashboard-stage" role="img" aria-label="Illustrations of Karachi buses on a city route">
          <svg className="stage-route" viewBox="0 0 720 170" preserveAspectRatio="none" aria-hidden="true"><path d="M18 127C117 127 103 31 230 31S359 133 478 91 604 28 704 28" /><circle cx="18" cy="127" r="7" /><circle cx="704" cy="28" r="7" /></svg>
          <div className="stage-buildings" aria-hidden="true" />
          <div className="stage-road" aria-hidden="true" />
          <img className="stage-bus stage-bus-metro" src="/images/ic_greenline.svg" alt="" />
          <img className="stage-bus stage-bus-red" src="/images/ic_red.svg" alt="" />
          <img className="stage-bus stage-bus-coach" src="/images/ic_coach.svg" alt="" />
        </div>
        <div className="network-summary"><span><strong>{data.routes.length}</strong> bus routes</span><span className="summary-dot" aria-hidden="true" /><span><strong>{data.stops.length}</strong> stops</span><span className="network-caption">Route information for Karachi commuters</span></div>
      </section>
      <div className="dashboard-content">
        <section className="home-search" aria-labelledby="home-search-title">
          <div className="home-section-heading"><div><h2 id="home-search-title">Search Buses &amp; Stops</h2><p>Type a route name, bus number, or stop.</p></div></div>
          <label className="search-field home-search-field"><Icons name="search" /><span className="sr-only">Search buses and stops</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try Green Line or Saddar" autoComplete="off" /></label>
          {query.trim() ? <div className="home-search-results" aria-live="polite">{results.routes.map(route => <AppLink key={route.id} href={`/route/${encodeURIComponent(route.id)}`}><span className="result-icon"><Icons name="bus" size={18} /></span><span><strong>{nameOf(route, language)}</strong><small>{typeName(route.type)} route</small></span><span className="result-arrow" aria-hidden="true">›</span></AppLink>)}{results.stops.map(stop => <AppLink key={stop.id} href={`/stop/${encodeURIComponent(stop.id)}`}><span className="result-icon"><Icons name="pin" size={18} /></span><span><strong>{nameOf(stop, language)}</strong><small>Bus stop</small></span><span className="result-arrow" aria-hidden="true">›</span></AppLink>)}{!results.routes.length && !results.stops.length && <p className="home-no-results">No match yet. Try a shorter name or a different spelling.</p>}</div> : <div className="home-search-links"><AppLink href="/buses">See all buses</AppLink><AppLink href="/stops">See all stops</AppLink></div>}
        </section>
        <section className="home-types" aria-labelledby="home-types-title"><div className="home-section-heading"><div><h2 id="home-types-title">Browse by Bus Type</h2><p>Recognize the bus? Pick its type to see routes.</p></div><AppLink href="/buses">All buses</AppLink></div><div className="type-grid home-type-grid">{busTypes.map(type => <AppLink href={`/buses/${type.id}`} className="type-card motion-reveal" key={type.id}><img src={`/images/${type.image}`} alt="" loading="lazy" /><strong>{type.name}</strong><small>{routeCountLabel(data.routes.filter(route => route.type === type.id).length)}</small></AppLink>)}</div></section>
        <section className="home-more" aria-labelledby="home-more-title"><h2 id="home-more-title">More Ways to Explore</h2><div className="home-more-grid"><AppLink href="/stops"><Icons name="pin" /><span><strong>Find a Bus Stop</strong><small>See which buses stop there</small></span></AppLink><AppLink href="/favorites"><Icons name="star" /><span><strong>Saved Places</strong><small>Your favorite routes and stops</small></span></AppLink></div></section>
        <div className="home-footer-links"><AppLink href="/add-route">Add a Missing Route</AppLink><AppLink href="/feedback">Report a Problem</AppLink><AppLink href="/about">About This Site</AppLink></div>
      </div>
    </main>
  </>
}

function BusList({ type }: { type?: string }) {
  const { data, language } = useApp()
  const [query, setQuery] = useState('')
  const [cardView, setCardView] = useState<'detailed' | 'classic'>(() => stored('brk-web-bus-card-view', 'detailed'))
  const search = query.trim().toLocaleLowerCase()
  const routes = useMemo(() => data.routes.filter(route => (!type || route.type === type) && (!search || `${route.name} ${route.urdu} ${route.id}`.toLocaleLowerCase().includes(search))), [data.routes, type, search])
  function changeCardView(view: 'detailed' | 'classic') {
    setCardView(view)
    localStorage.setItem('brk-web-bus-card-view', JSON.stringify(view))
  }
  return <>
    <PageHeader title={type ? typeName(type) : 'All Buses'} />
    <main id="main-content" className="screen content-screen">
      <div className="screen-intro"><h1>{type ? typeName(type) : 'Find a Bus'}</h1><p>{type ? `Explore ${typeName(type).toLowerCase()} routes across Karachi.` : 'Search by route name or choose the bus you recognize.'}</p></div>
      <label className="search-field bus-search-field"><Icons name="search" /><span className="sr-only">Search buses</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try Green Line or bus number" autoComplete="off" /></label>
      {!type && !search && <section className="type-grid" aria-label="Bus types">{busTypes.map(item => <AppLink href={`/buses/${item.id}`} className="type-card motion-reveal" key={item.id}><img src={`/images/${item.image}`} alt="" loading="lazy" /><strong>{item.name}</strong><small>{routeCountLabel(data.routes.filter(route => route.type === item.id).length)}</small></AppLink>)}</section>}
      {!search && <div className="quick-links"><AppLink href="/plan"><Icons name="route" />Plan a Trip</AppLink><AppLink href="/stops"><Icons name="pin" />Find a Stop</AppLink></div>}
      <section className="list-section bus-route-section"><div className="list-heading"><h2>{search ? 'Matching Buses' : type ? `${typeName(type)} Routes` : 'All Routes'}</h2><span>{routeCountLabel(routes.length)}</span></div>
        <div className="bus-view-switch" role="group" aria-label="Bus card view"><button type="button" aria-pressed={cardView === 'detailed'} onClick={() => changeCardView('detailed')}>Detailed</button><button type="button" aria-pressed={cardView === 'classic'} onClick={() => changeCardView('classic')}>Classic</button></div>
        <div className={`route-list ${cardView === 'detailed' ? 'detailed-route-list' : ''}`}>{routes.length ? routes.map(route => cardView === 'detailed' ? <DetailedRouteCard key={route.id} route={route} /> : <RouteCard key={route.id} route={route} />) : <div className="empty-state">No buses match your search. Try another name or number.</div>}</div>
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
    const picker = dialog.current
    if (!picker) return
    if (!open) {
      picker.close()
      return
    }

    picker.showModal()
    const updateViewport = () => {
      const viewport = window.visualViewport
      picker.style.setProperty('--picker-height', `${viewport?.height ?? window.innerHeight}px`)
      picker.style.setProperty('--picker-top', `${viewport?.offsetTop ?? 0}px`)
    }
    updateViewport()
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
      picker.close()
    }
  }, [open])
  const results = useMemo(() => data.stops.filter(stop => !query || `${stop.name} ${stop.urdu}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 60), [data.stops, query])
  return <>
    <button type="button" className="stop-select" onClick={() => { setQuery(''); setOpen(true) }} aria-label={`${label}: ${value ? nameOf(data.stopById.get(value), language) : 'Choose a stop'}`}><span><small>{label}</small><strong>{value ? nameOf(data.stopById.get(value), language) : 'Choose a stop'}</strong></span><Icons name="search" size={21} /></button>
    <dialog ref={dialog} className="stop-dialog" onClose={() => setOpen(false)} aria-label={`Choose ${label.toLowerCase()}`}>
      <div className="dialog-header"><h2>Choose {label.toLowerCase()}</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close stop picker">×</button></div>
      <label className="search-field"><Icons name="search" /><span className="sr-only">Search stops</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search stop name" autoComplete="off" /></label>
      <div className="stop-options">{results.length ? results.map(stop => <button type="button" key={stop.id} onClick={() => { onChange(stop.id); setOpen(false) }}><Icons name="pin" size={20} /><span>{nameOf(stop, language)}</span></button>) : <p className="empty-state">No stop found. Try a different spelling.</p>}</div>
    </dialog>
  </>
}

function PlanPage() {
  const { data, language } = useApp()
  const params = new URLSearchParams(location.search)
  const [from, setFrom] = useState(params.get('from') || '')
  const [to, setTo] = useState(params.get('to') || '')
  const [searched, setSearched] = useState(false)
  const routes = searched ? findDirectRoutes(data, from, to) : null
  const [error, setError] = useState('')
  async function find() {
    if (!from || !to) { setError('Choose both stops to find a bus.'); return }
    if (from === to) { setError('Choose two different stops.'); return }
    setError('')
    try {
      setSearched(true)
      history.replaceState(null, '', `/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    } catch { setError('Route suggestions could not load. Try again.') }
  }
  useEffect(() => { if (from && to) void find() }, []) // Restore shared journey URLs on first load.
  const fromStop = data.stopById.get(from)
  const toStop = data.stopById.get(to)
  return <><PageHeader title="Plan a Trip" /><main id="main-content" className="screen content-screen">
    <div className="screen-intro"><h1>Plan a Trip</h1><p>Choose where your trip starts and ends.</p></div>
    <section className="planner-card"><StopPicker label="From stop" value={from} onChange={id => { setFrom(id); setSearched(false) }} /><button type="button" className="swap-action" onClick={() => { setFrom(to); setTo(from); setSearched(false) }} aria-label="Swap stops"><Icons name="swap" />Swap stops</button><StopPicker label="To stop" value={to} onChange={id => { setTo(id); setSearched(false) }} /><button className="wide-button" type="button" onClick={() => void find()}>Find Buses</button>{error && <p className="form-error" role="alert">{error}</p>}</section>
    {routes && <section className="list-section"><div className="list-heading"><h2>{fromStop && toStop ? `${nameOf(fromStop, language)} → ${nameOf(toStop, language)}` : 'Suggested Buses'}</h2><span>{routes.length} direct {routes.length === 1 ? 'bus' : 'buses'}</span></div><div className="route-list">{routes.length ? routes.map(route => <RouteCard key={route.id} route={route} trip={fromStop && toStop ? { from: fromStop, to: toStop } : undefined} />) : <div className="empty-state">No direct bus was found. Try a nearby stop or browse all buses.</div>}</div></section>}
    <AppLink href="/buses" className="text-link">Browse all buses</AppLink>
  </main></>
}

function StopsPage() {
  const { data, language } = useApp()
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(60)
  const search = useDeferredValue(query.trim().toLocaleLowerCase())
  const matching = useMemo(() => data.stops.filter(stop => !search || `${stop.name} ${stop.urdu}`.toLocaleLowerCase().includes(search)), [data.stops, search])
  const visible = matching.slice(0, visibleCount)
  return <>
    <PageHeader title="Bus Stops" />
    <main id="main-content" className="screen content-screen stops-screen">
      <div className="screen-intro"><h1>Find a Bus Stop</h1><p>Search a stop by name to see which buses go there.</p></div>
      <div className="stops-search-sticky">
        <label className="search-field"><Icons name="search" /><span className="sr-only">Search all bus stops</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(60) }} placeholder="Try Saddar or Tower" autoComplete="off" /></label>
      </div>
      <div className="list-heading stops-results-heading"><h2>{query ? 'Matching Stops' : 'Browse All Stops'}</h2><span aria-live="polite">{matching.length} {matching.length === 1 ? 'stop' : 'stops'}</span></div>
      <div className="stop-list-grid">{visible.map(stop => <StopCard key={stop.id} stop={stop} />)}</div>
      {!matching.length && <div className="empty-state"><strong>No stop found</strong><p>Try a shorter name or a different spelling.</p></div>}
      {matching.length > visible.length && <button className="outline-button stops-load-more" type="button" onClick={() => setVisibleCount(count => count + 60)}>Show More Stops</button>}
      {language === 'ur' && <p className="language-note">اسٹاپ کے نام اردو میں دکھائے جا رہے ہیں۔</p>}
    </main>
  </>
}

function StopDetail({ id }: { id: string }) {
  const { data, language } = useApp()
  const stop = data.stopById.get(id)
  if (!stop) return <NotFound />
  const routes = ids(data.routesOnStop[id]).map(routeId => data.routeById.get(routeId)).filter((route): route is Route => Boolean(route))
  return <><PageHeader title="Bus Stop" action={<FavoriteButton kind="stops" id={id} />} /><main id="main-content" className="screen content-screen"><div className="detail-hero"><span className="detail-icon"><Icons name="pin" size={32} /></span><div><small>Bus stop</small><h1>{nameOf(stop, language)}</h1>{language !== 'en' && <p>{stop.name}</p>}</div></div><div className="list-heading"><h2>Routes at this Stop</h2><span>{routes.length} buses</span></div><div className="route-list">{routes.length ? routes.map(route => <RouteCard key={route.id} route={route} />) : <p className="empty-state">No routes are listed for this stop.</p>}</div><AppLink href="/stops" className="text-link">Choose another stop</AppLink></main></>
}

function RouteSourceNote({ id }: { id: string }) {
  const source = reviewedRoutes.changes.find(change => change.id === id)
  return source ? <p className="route-source-note">Updated from <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">SMTA route information</a>, checked 22 October 2026. Published coverage includes stops and areas; boarding points may differ. Confirm your journey locally.</p> : null
}

function RouteDetail({ id }: { id: string }) {
  const { data, language } = useApp()
  const route = data.routeById.get(id)
  if (!route) return <NotFound />
  const first = data.stopById.get(route.firstStop)
  const last = data.stopById.get(route.lastStop)
  const count = ids(data.stopsOnRoute[id]).length
  const source = reviewedRoutes.changes.find(change => change.id === id)
  return <>
    <PageHeader title="Bus Details" action={<a className="topbar-home" href="#route-map">Map</a>} />
    <main id="main-content" className="screen content-screen">
      <section className="route-detail-card"><div className="detail-card-top"><span>Route Details</span><FavoriteButton kind="routes" id={id} /></div><div className="route-identity"><img src={routeImage(route)} alt={`${typeName(route.type)} illustration`} /><div><h1>{nameOf(route, language)}</h1>{route.urdu && language === 'en' && <p lang="ur" dir="rtl">{route.urdu}</p>}<span className="type-pill"><Icons name="bus" size={16} />{typeName(route.type)}</span></div></div></section>
      <section className="journey-panel"><h2>Route Journey</h2><div className="journey-point"><span><Icons name="pin" /></span><div><small>Starting Point</small><strong>{nameOf(first, language)}</strong></div></div><div className="journey-line" /><div className="journey-point end"><span><Icons name="pin" /></span><div><small>Destination</small><strong>{nameOf(last, language)}</strong></div></div><AppLink href={`/route/${id}/stops`} className="wide-button secondary">View {count} {source?.publishedCoverage ? 'Stops & Areas' : 'Stops'}</AppLink></section>
      <RouteSourceNote id={id} />
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
  return <><PageHeader title="Route Stops" action={<button className="topbar-home" type="button" onClick={() => sharePage(`${route.name} stops`)}>Share</button>} /><main id="main-content" className="screen content-screen"><div className="route-stops-heading"><img src={routeImage(route)} alt="" /><div><small>Route</small><h1>{nameOf(route, language)}</h1></div></div><RouteSourceNote id={id} /><div className="list-heading"><h2>Listed Stops &amp; Areas</h2><span>{stops.length} listed</span></div><div className="stop-list-grid">{stops.map((stop, index) => <div key={stop.id} className="numbered-stop"><span>{index + 1}</span><StopCard stop={stop} routeId={id} /></div>)}</div></main></>
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
  return <><PageHeader title="Settings" /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>Settings</h1><p>Choose how the app looks and displays route names.</p></div><section className="settings-card"><h2>Language</h2>{languageOptions.map(([value, label]) => <button type="button" className={`choice ${language === value ? 'selected' : ''}`} key={value} onClick={() => setLanguage(value)}><Icons name="globe" /><span>{label}</span>{language === value && <span className="check" aria-label="Selected"><Icons name="check" size={19} /></span>}</button>)}</section><section className="settings-card"><h2>Theme</h2>{themeOptions.map(([value, label]) => <button type="button" className={`choice ${theme === value ? 'selected' : ''}`} key={value} onClick={() => setTheme(value)}><Icons name="settings" /><span>{label}</span>{theme === value && <span className="check" aria-label="Selected"><Icons name="check" size={19} /></span>}</button>)}</section><section className="settings-card"><h2>Data & Privacy</h2><p>Saved routes, stops, and display preferences stay on this device. Route data is available offline and checks for updates when you are online.</p><button className="outline-button" type="button" onClick={() => { if (confirm('Remove all saved routes and stops?')) { clearFavorites(); setCleared(true) } }}>Clear Saved Items</button>{cleared && <p className="success-message" role="status">Saved items removed.</p>}<div className="settings-links"><AppLink href="/data">View Data</AppLink><AppLink href="/about">About</AppLink><AppLink href="/privacy">Privacy</AppLink><AppLink href="/contact">Contact</AppLink></div></section></main></>
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
  return <><PageHeader title={title} /><main id="main-content" className="screen content-screen"><article className="info-card"><h1>{title}</h1>{kind === 'about' && <><p>Konsi Bus Karachi helps people find routes and stops across the city. This website follows the Android app’s public screens and uses its original bus artwork.</p><p>Find buses between stops, browse by type, view every stop on a route, and save the places you use often.</p><p>Routes can update from the original app's database when you are online. This is not a live timetable or vehicle tracker. Confirm important journeys locally because services can change.</p></>}{kind === 'privacy' && <><p>Route searches run in your browser using the bundled data. Favorites, language, and theme are stored in this browser’s local storage.</p><p>Browsing does not require sign-in, and the app does not track your location. Sending a report or route suggestion creates an anonymous Firebase session. Your message and a session identifier are sent to the project team; route suggestions are reviewed before publication. Reviews are sent to the original app's reviews service and may be public, with an installation identifier used to limit repeated submissions. Opening Google Maps or your email app uses those services’ own privacy policies.</p></>}{kind === 'data' && <><p><strong>{data.routes.length}</strong> routes and <strong>{data.stops.length}</strong> stops are available in the current route data.</p><p>Selected public-service routes were checked against <a href="https://smta.gos.pk/route-map" target="_blank" rel="noopener noreferrer">SMTA route information</a> on 22 October 2026. Other routes retain the existing community dataset. Published coverage includes stops and areas, not live positions or guaranteed schedules.</p><p>The bundled route and stop files can be downloaded below. They contain names and route connections, not live positions or times.</p><div className="settings-links"><a href="/data/routes.json" download>Routes data</a><a href="/data/stops.json" download>Stops data</a></div><DataSyncControls /></>}{kind === 'share' && <><p>Share Konsi Bus Karachi with another commuter.</p><button className="wide-button" type="button" onClick={() => sharePage('Konsi Bus Karachi')}>Share App</button></>}{kind === 'contact' && <><p>Found an error or have a question? Email the project team.</p><a className="wide-button" href="mailto:droidclics@gmail.com">Email Droid Clics</a></>}</article></main></>
}

function ContributionPage({ type, routeId }: { type: 'route' | 'feedback' | 'experience'; routeId?: string }) {
  const { data } = useApp()
  const route = routeId ? data.routeById.get(routeId) : undefined
  if (routeId && !route) return <NotFound />
  const title = type === 'route' ? 'Add Missing Route' : type === 'experience' ? 'Share Experience' : route ? 'Report Route Issue' : 'Feedback'
  return <><PageHeader title={title} /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>{title}</h1><p>{type === 'route' ? 'Help the community by sharing a route missing from the list.' : route ? `Tell us what needs updating on ${route.name}.` : 'Share your experience or help the project team improve the app.'}</p></div>{type === 'experience' ? <ReviewComposer /> : <ContributionForm key={routeId || type} routeId={routeId} isRoute={type === 'route'} />}</main></>
}

function ReviewsPage({ id }: { id: string }) {
  const { data } = useApp()
  const route = data.routeById.get(id)
  if (!route) return <NotFound />
  return <><PageHeader title="Route Reviews" /><main id="main-content" className="screen content-screen"><div className="screen-intro"><h1>{route.name} Reviews</h1><p>Read passenger experiences and share your own.</p></div><ReviewsPanel key={id} routeId={id} /></main></>
}

function DataSyncControls() {
  const [status, setStatus] = useState(getDataSyncStatus)
  useEffect(() => subscribeDataSync(() => setStatus(getDataSyncStatus())), [])
  const label = status.phase === 'checking' ? 'Checking for route updates...' : status.phase === 'offline' ? 'Using saved routes. Connect to the internet to check for updates.' : status.source === 'online' ? 'Online route information checked.' : 'Using saved route information.'
  return <div className="data-sync-controls"><p role="status">{label}</p>{status.updatedAt && <p>Last updated: {new Date(status.updatedAt).toLocaleString()}</p>}<button type="button" className="outline-button" disabled={status.phase === 'checking'} onClick={() => void refreshData()}>Check for Updates</button></div>
}

function NotFound() {
  return <><PageHeader title="Not Found" /><main id="main-content" className="screen content-screen"><div className="empty-state"><h1>Page not found</h1><p>The route or stop may have changed.</p><AppLink href="/">Go Home</AppLink></div></main></>
}


function ScreenRouter() {
  const path = location.pathname
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return <Dashboard />
  if (parts[0] === 'buses') return <BusList type={parts[1]} />
  if (parts[0] === 'plan') return <PlanPage />
  if (parts[0] === 'stops') return <StopsPage />
  if (parts[0] === 'stop' && parts[1]) {
    const id = pathId(parts[1])
    return id ? <StopDetail id={id} /> : <NotFound />
  }
  if (parts[0] === 'route' && parts[1]) {
    const id = pathId(parts[1])
    if (!id) return <NotFound />
    if (parts[2] === 'stops') return <RouteStops id={id} />
    if (parts[2] === 'map') return <MapPage id={id} />
    if (parts[2] === 'reviews') return <ReviewsPage id={id} />
    return <RouteDetail id={id} />
  }
  if (parts[0] === 'favorites') return <FavoritesPage />
  if (parts[0] === 'settings') return <SettingsPage />
  if (parts[0] === 'add-route') return <ContributionPage type="route" />
  if (parts[0] === 'feedback') return <ContributionPage type="feedback" routeId={new URLSearchParams(location.search).get('route') || undefined} />
  if (parts[0] === 'experience') return <ContributionPage type="experience" />
  if (parts[0] === 'about' || parts[0] === 'privacy' || parts[0] === 'data' || parts[0] === 'share' || parts[0] === 'contact') return <InfoPage kind={parts[0]} />
  return <NotFound />
}

export default function App() {
  useEffect(() => {
    const root = document.getElementById('root')
    if (root) return installPressFeedback(root)
  }, [])
  const [data, setData] = useState<TransitData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [path, setPath] = useState(location.pathname + location.search)
  const [language, updateLanguage] = useState<Language>(() => stored('brk-web-language', 'en'))
  const [theme, updateTheme] = useState<Theme>(() => stored('brk-web-theme', 'light'))
  const [favorites, setFavorites] = useState<Favorites>(() => savedFavorites(stored<unknown>('brk-web-favorites', null)))

  useEffect(() => {
    let active = true
    const stopUpdates = subscribeData(value => { if (active) setData(value) })
    loadData().then(value => { if (active) setData(value); void refreshData() }).catch(() => { if (active) setLoadError('Route data could not load. Refresh the page to try again.') })
    const update = () => setPath(location.pathname + location.search)
    window.addEventListener('popstate', update)
    window.addEventListener('brk:navigate', update)
    const checkOnline = () => { if (document.visibilityState === 'visible') void refreshData() }
    window.addEventListener('online', checkOnline)
    document.addEventListener('visibilitychange', checkOnline)
    return () => { active = false; stopUpdates(); window.removeEventListener('popstate', update); window.removeEventListener('brk:navigate', update); window.removeEventListener('online', checkOnline); document.removeEventListener('visibilitychange', checkOnline) }
  }, [])

  useEffect(() => {
    localStorage.setItem('brk-web-theme', JSON.stringify(theme))
    if (theme === 'system') return watchSystemTheme(dark => {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    })
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language === 'ur' ? 'ur' : 'en'
  }, [language])

  useEffect(() => {
    if (!data) return
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const observer = !reduceMotion && 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer?.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px 55px 0px', threshold: 0.08 }) : null
    let index = 0
    const watch = (item: HTMLElement) => {
      if (item.classList.contains('is-visible')) return
      item.style.setProperty('--reveal-delay', `${Math.min(index++ % 5, 4) * 45}ms`)
      if (observer) observer.observe(item)
      else item.classList.add('is-visible')
    }
    document.querySelectorAll<HTMLElement>('.motion-reveal').forEach(watch)
    const mutationObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (!(node instanceof HTMLElement)) return
      if (node.matches('.motion-reveal')) watch(node)
      node.querySelectorAll<HTMLElement>('.motion-reveal').forEach(watch)
    })))
    const root = document.getElementById('root')
    if (root) mutationObserver.observe(root, { childList: true, subtree: true })
    return () => { observer?.disconnect(); mutationObserver.disconnect() }
  }, [data, path])

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

  if (loadError) return <div className="startup-message" role="alert"><img src="/images/ic_konsi_bus_karachi.svg" alt="" /><h1>Konsi Bus Karachi</h1><p>{loadError}</p><button type="button" onClick={() => location.reload()}>Try Again</button></div>
  if (!data) return <div className="startup-message" role="status"><img src="/images/ic_konsi_bus_karachi.svg" alt="" /><h1>Konsi Bus Karachi</h1><p>Loading routes and stops…</p></div>

  const value: AppState = { data, language, setLanguage, theme, setTheme, favorites, toggleFavorite, clearFavorites }
  return <Context.Provider value={value}><a className="skip-link" href="#main-content">Skip to content</a><div className="app-shell" data-path={path}><ScreenRouter /><BottomNav /></div></Context.Provider>
}
