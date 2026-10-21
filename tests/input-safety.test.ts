import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pathId, savedFavorites } from '../src/inputSafety'
import { boundedJson } from '../src/backend/json'

test('malformed crafted route paths cannot throw or escape the route identifier', () => {
  for (const input of ['%', '%E0%A4%A', '%00', '%2f..%2f', 'javascript%3Aalert(1)', 'x'.repeat(81)]) {
    assert.equal(pathId(input), undefined)
  }
  assert.equal(pathId('greenline'), 'greenline')
  assert.equal(pathId('%53' + '0001'), 'S0001')
})

test('corrupted preference data cannot reach favorite array operations', () => {
  for (const value of [null, [], 'invalid', { routes: null, stops: [] }, { routes: {}, stops: [] }, { routes: ['x'], stops: [12] }, { routes: ['../route'], stops: [] }]) {
    assert.deepEqual(savedFavorites(value), { routes: [], stops: [] })
  }
  assert.deepEqual(savedFavorites({ routes: ['greenline', 'greenline'], stops: ['S0001'] }), { routes: ['greenline'], stops: ['S0001'] })
})

test('streaming JSON limit cancels an oversized response before it is fully read', async () => {
  let pulls = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++
      controller.enqueue(new Uint8Array(65_536))
      if (pulls === 32) controller.close()
    },
    cancel() { cancelled = true },
  })
  await assert.rejects(boundedJson(new Response(stream), 100_000), /too large/)
  assert.ok(pulls < 32)
  assert.equal(cancelled, true)
})

test('JSON reader enforces announced size, counts UTF-8 bytes and rejects invalid data', async () => {
  await assert.rejects(boundedJson(new Response('{}', { headers: { 'Content-Length': '200' } }), 100), /too large/)
  await assert.rejects(boundedJson(new Response(JSON.stringify('ب'.repeat(60))), 100), /too large/)
  await assert.rejects(boundedJson(new Response(new Uint8Array([0xff, 0xfe])), 100), /invalid response/)
  await assert.rejects(boundedJson(new Response('not JSON'), 100), /invalid response/)
  assert.deepEqual(await boundedJson(new Response(JSON.stringify({ ok: true })), 100), { ok: true })
})
