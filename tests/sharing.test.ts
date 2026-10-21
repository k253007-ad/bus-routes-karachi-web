import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sharePage } from '../src/sharing'

test('sharing preserves public pages, dismisses cancellation, and safely falls back', async t => {
  const originals = Object.getOwnPropertyDescriptors(globalThis)
  const writes: string[] = []
  const alerts: string[] = []
  const shares: ShareData[] = []
  const nav: { share?: (data: ShareData) => Promise<void>; clipboard?: { writeText: (text: string) => Promise<void> } } = {}
  const dataset: Record<string, string> = {}
  const page = new URL('https://example.org/route/ev01?from=S0001#stops')
  for (const [key, value] of Object.entries({ navigator: nav, location: page, document: { documentElement: { dataset } }, alert: (text: string) => alerts.push(text) })) {
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  t.after(() => {
    for (const key of ['navigator', 'location', 'document', 'alert']) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  nav.clipboard = { writeText: async text => { writes.push(text) } }
  nav.share = async data => { shares.push(data) }
  await t.test('successful web share preserves origin, query and hash', async () => {
    await sharePage('EV-1')
    assert.equal(shares[0].url, page.href)
    assert.equal(writes.length, 0)
  })
  await t.test('cancelling the share sheet never writes clipboard', async () => {
    nav.share = async () => { throw new DOMException('Dismissed', 'AbortError') }
    await sharePage('EV-1')
    assert.equal(writes.length, 0)
    assert.equal(alerts.length, 0)
  })
  await t.test('unsupported share copies canonical native route URL', async () => {
    dataset.nativeApp = 'true'
    page.href = 'https://localhost/route/ev01?from=S0001#stops'
    nav.share = undefined
    writes.length = 0
    await sharePage('EV-1')
    assert.equal(writes[0], 'https://bus-khi-routes.vercel.app/route/ev01?from=S0001#stops')
  })
  await t.test('native share failure falls back using same public URL', async () => {
    nav.share = async () => { throw new Error('Share unavailable') }
    writes.length = 0
    await sharePage('EV-1')
    assert.equal(writes[0], 'https://bus-khi-routes.vercel.app/route/ev01?from=S0001#stops')
  })
  await t.test('clipboard rejection produces honest feedback', async () => {
    nav.share = undefined
    nav.clipboard = { writeText: async () => { throw new Error('Denied') } }
    alerts.length = 0
    await assert.doesNotReject(sharePage('EV-1'))
    assert.match(alerts[0], /could not|couldn't|unable/i)
  })
  await t.test('a native path starting with two slashes cannot change the public host', async () => {
    page.href = 'https://localhost//example.org/route/ev01?x=1#stops'
    nav.share = async data => { shares.push(data) }
    await sharePage('EV-1')
    assert.equal(shares.at(-1)?.url, 'https://bus-khi-routes.vercel.app//example.org/route/ev01?x=1#stops')
  })
  await t.test('unavailable clipboard does not throw or claim success', async () => {
    nav.share = undefined
    nav.clipboard = undefined
    alerts.length = 0
    await assert.doesNotReject(sharePage('EV-1'))
    assert.match(alerts[0], /could not|couldn't|unavailable/i)
  })
})
