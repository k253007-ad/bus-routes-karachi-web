import assert from 'node:assert/strict'
import { test } from 'node:test'
import { watchSystemTheme } from '../src/systemTheme'

test('System theme follows both OS changes and stops updating after cleanup', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia')
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const media = {
    matches: false,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  }
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => media })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'matchMedia', original); else Reflect.deleteProperty(globalThis, 'matchMedia') })
  const values: boolean[] = []
  const stop = watchSystemTheme(dark => values.push(dark))
  assert.deepEqual(values, [false])
  for (const dark of [true, false]) {
    media.matches = dark
    listeners.forEach(listener => listener({ matches: dark }))
  }
  assert.deepEqual(values, [false, true, false])
  stop()
  assert.equal(listeners.size, 0)
  listeners.forEach(listener => listener({ matches: true }))
  assert.deepEqual(values, [false, true, false])
})
