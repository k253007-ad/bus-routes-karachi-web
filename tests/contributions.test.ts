import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contributionPayload, createContributionClient } from '../src/backend/contributions'
import type { Contribution } from '../src/backend/contributions'

const id = 'a'.repeat(32)
const feedback: Contribution = { kind: 'feedback', category: 'suggestion', details: 'Please improve the route information.' }
const identity = async () => ({ uid: 'guest-user', token: 'test-token' })
const echoed = (_url: string, init?: RequestInit) => {
  const response: Record<string, any> = {}
  for (const [key, data] of Object.entries(JSON.parse(init!.body as string))) {
    const parts = key.split('/')
    let node = response
    for (const part of parts.slice(0, -1)) node = node[part] ||= {}
    node[parts.at(-1)!] = { ...data as object, timestamp: 123456 }
  }
  return Promise.resolve(response)
}

test('feedback, route issues and suggestions match the original Firebase contracts', () => {
  const general = contributionPayload(feedback, 'guest-user', id)
  assert.equal(general.collection, 'feedback')
  assert.deepEqual(general.data, { input: feedback.details, type: 'suggestion', deviceId: 'guest-user', timestamp: { '.sv': 'timestamp' } })
  const issue = contributionPayload({ kind: 'issue', routeId: 'greenline', category: 'wrong_stops', details: 'This stop is missing from the route.' }, 'guest-user', id)
  assert.equal(issue.collection, 'bus_feedback')
  assert.equal(issue.data.routeId, 'greenline')
  assert.equal(issue.data.feed, 'wrong_stops')
  assert.equal(issue.data.feedType, 'wrong_stops')
  const route = contributionPayload({ kind: 'route', busType: 'red', name: ' New Bus ', startStop: ' Tower ', endStop: 'Saddar', intermediateStops: ' Stop one\n\nStop two ' }, 'guest-user', id)
  assert.equal(route.collection, 'stops_pending')
  assert.deepEqual(route.data.intermediateStops, ['Stop one', 'Stop two'])
  assert.equal(route.data.status, 'pending')
  assert.equal(route.data.userId, 'guest-user')
  assert.equal(route.data.busName, 'New Bus')
  assert.ok(!('adminNotes' in route.data))
})

test('empty optional stops are omitted because Firebase cannot preserve empty arrays', async () => {
  const input: Contribution = { kind: 'route', name: 'New route', busType: 'bus', startStop: 'Tower', endStop: 'Saddar', intermediateStops: '' }
  assert.ok(!('intermediateStops' in contributionPayload(input, 'guest-user', id).data))
  await createContributionClient(identity, echoed)(input, id)
})

test('invalid contributions never authenticate or write', async () => {
  let calls = 0
  const send = createContributionClient(async () => { calls++; return identity() }, async () => { calls++; return null })
  await assert.rejects(send({ ...feedback, details: 'short' }, id), /10/)
  await assert.rejects(send({ kind: 'issue', routeId: 'red', category: 'other', details: 'x'.repeat(501) }, id), /500/)
  await assert.rejects(send({ kind: 'route', busType: 'made-up', name: 'New route', startStop: 'Tower', endStop: 'Saddar', intermediateStops: '' }, id), /bus type/)
  await assert.rejects(send(feedback, '../unsafe'), /reopen/)
  assert.equal(calls, 0)
})

test('atomically sends a stable record and matching server-time ledger without admin fields', async () => {
  let calls = 0
  const send = createContributionClient(identity, async (url, init) => {
    calls++
    const parsed = new URL(url)
    assert.equal(parsed.protocol, 'https:')
    assert.equal(parsed.pathname, '/.json')
    assert.equal(parsed.searchParams.get('auth'), 'test-token')
    assert.equal(init?.method, 'PATCH')
    const updates = JSON.parse(init!.body as string)
    assert.ok(!('status' in updates[`feedback/${id}`]))
    assert.equal(updates[`feedback/${id}`].deviceId, 'guest-user')
    assert.deepEqual(updates['submission_limits/guest-user/feedback'], { timestamp: { '.sv': 'timestamp' }, submissionId: id })
    return echoed(url, init)
  })
  await send(feedback, id)
  await assert.rejects(send(feedback, 'b'.repeat(32)), /wait a minute/)
  assert.equal(calls, 1)
})

test('rejects malformed or mismatched confirmations, then permits a safe retry of the same ID', async () => {
  for (const invalid of [null, {}, { feedback: { [id]: { ...contributionPayload(feedback, 'guest-user', id).data, timestamp: 1, input: 'changed message' } } }, { [`feedback/${id}`]: { ...contributionPayload(feedback, 'guest-user', id).data, timestamp: 1 } }]) {
    let calls = 0
    const send = createContributionClient(identity, async (url, init) => ++calls === 1 ? invalid : echoed(url, init))
    await assert.rejects(send(feedback, id), /did not confirm/)
    await send(feedback, id)
    assert.equal(calls, 2)
  }
})

test('prevents simultaneous taps and never retries uncertain writes automatically', async () => {
  let rejectRequest!: (error: Error) => void
  let calls = 0
  const send = createContributionClient(identity, async () => { calls++; return new Promise((_resolve, reject) => { rejectRequest = reject }) })
  const first = send(feedback, id)
  await Promise.resolve()
  await assert.rejects(send(feedback, id), /already being sent/)
  rejectRequest(new Error('Connection interrupted'))
  await assert.rejects(first, /Connection interrupted/)
  assert.equal(calls, 1)
})
