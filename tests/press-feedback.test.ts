import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installPressFeedback } from '../src/pressFeedback'

test('press feedback is bounded, cleaned up, and respects live reduced-motion changes', t => {
  const originals = Object.getOwnPropertyDescriptors(globalThis)
  const media = new EventTarget() as EventTarget & { matches: boolean }
  media.matches = false
  const root = new EventTarget() as EventTarget & { contains: () => boolean }
  root.contains = () => true
  let disabled = false
  let active = 0
  let cancelled = 0
  const keyframes: unknown[] = []
  const nodes: FakeElement[] = []
  class FakeElement {
    style: Record<string, string> = {}
    className = ''
    removed = false
    closest() { return button }
    matches() { return disabled }
    getBoundingClientRect() { return { left: 0, top: 0, width: 160, height: 48 } }
    setAttribute() {}
    append(node: FakeElement) { nodes.push(node) }
    remove() { this.removed = true }
    animate(frames: unknown) {
      active++
      keyframes.push(frames)
      let reject: (reason: Error) => void = () => {}
      const finished = new Promise<void>((_, fail) => { reject = fail })
      let live = true
      return { finished, cancel() { if (live) { live = false; active--; cancelled++; reject(new Error('cancelled')) } } }
    }
  }
  const button = new FakeElement()
  Object.defineProperties(globalThis, {
    Element: { configurable: true, value: FakeElement },
    HTMLElement: { configurable: true, value: FakeElement },
    document: { configurable: true, value: { createElement: () => new FakeElement() } },
    matchMedia: { configurable: true, value: () => media },
  })
  t.after(() => {
    for (const key of ['Element', 'HTMLElement', 'document', 'matchMedia']) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  const press = () => {
    const event = new Event('click')
    Object.defineProperties(event, { target: { value: button }, detail: { value: 1 }, clientX: { value: 20 }, clientY: { value: 15 } })
    root.dispatchEvent(event)
  }
  const stop = installPressFeedback(root as unknown as HTMLElement)
  press()
  assert.equal(nodes.length, 1)
  assert.equal(active, 1)
  assert.deepEqual(Object.keys((keyframes[0] as object[])[0]).sort(), ['opacity', 'transform'])
  for (let i = 0; i < 30; i++) press()
  assert.equal(active, 1, 'repeat clicks replace their previous ripple')
  assert.ok(cancelled >= 30)
  disabled = true
  press()
  assert.equal(nodes.length, 31)
  disabled = false
  media.matches = true
  media.dispatchEvent(new Event('change'))
  assert.equal(active, 0)
  press()
  assert.equal(nodes.length, 31)
  media.matches = false
  media.dispatchEvent(new Event('change'))
  press()
  assert.equal(active, 1)
  stop()
  assert.equal(active, 0)
  press()
  assert.equal(nodes.length, 32)
  assert.ok(nodes.every(node => node.removed))
})
