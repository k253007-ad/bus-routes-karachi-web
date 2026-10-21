import { firebaseConfig } from './config'
import { guestIdentity } from './firebase'
import { requestJson } from './http'

export type Contribution =
  | { kind: 'feedback'; details: string; category: 'suggestion' | 'bug' | 'other' }
  | { kind: 'issue'; details: string; routeId: string; category: 'wrong_stops' | 'outdated' | 'missing_info' | 'other' }
  | { kind: 'route'; name: string; busType: string; startStop: string; endStop: string; intermediateStops: string }

const serverTime = { '.sv': 'timestamp' }

function responseRecord(value: unknown, path: string[]): Record<string, unknown> | undefined {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !Object.hasOwn(current, key)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : undefined
}

function text(value: string, name: string, min: number, max: number) {
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) throw new Error(`${name} must be ${min}–${max} characters.`)
  return trimmed
}

export function contributionPayload(input: Contribution, uid: string, id: string) {
  if (input.kind === 'feedback') {
    if (!['suggestion', 'bug', 'other'].includes(input.category)) throw new Error('Choose a feedback category.')
    return { collection: 'feedback', data: { input: text(input.details, 'Your message', 10, 1000), type: input.category, deviceId: uid, timestamp: serverTime } }
  }
  if (input.kind === 'issue') {
    if (!['wrong_stops', 'outdated', 'missing_info', 'other'].includes(input.category)) throw new Error('Choose an issue category.')
    // Current database rules use `feed`; the original admin app reads `feedType`.
    return { collection: 'bus_feedback', data: { comment: text(input.details, 'Your message', 10, 500), feed: input.category, feedType: input.category, routeId: text(input.routeId, 'Route', 1, 50), deviceId: uid, timestamp: serverTime } }
  }
  if (!['dd', 'metro', 'red', 'pink', 'ev', 'mini', 'coach', 'bus', 'rick'].includes(input.busType)) throw new Error('Choose a bus type.')
  const intermediateStops = input.intermediateStops.split('\n').map(stop => stop.trim()).filter(Boolean)
  if (intermediateStops.length > 100) throw new Error('Enter at most 100 intermediate stops.')
  intermediateStops.forEach(stop => text(stop, 'Each intermediate stop', 3, 100))
  return { collection: 'stops_pending', data: {
    id, busName: text(input.name, 'Bus or route name', 2, 50), busType: input.busType,
    startStop: text(input.startStop, 'Starting stop', 3, 100), endStop: text(input.endStop, 'Destination stop', 3, 100),
    ...(intermediateStops.length ? { intermediateStops } : {}), timestamp: serverTime, userId: uid, status: 'pending',
  } }
}

export function createContributionClient(identity = guestIdentity, request = requestJson) {
  let sending = false
  let lastSent = 0
  return async (input: Contribution, id: string) => {
    // Validate before requesting a guest identity or making any remote writes.
    contributionPayload(input, 'validation', id)
    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(id)) throw new Error('Please reopen this form and try again.')
    if (sending) throw new Error('Your message is already being sent.')
    if (Date.now() - lastSent < 60_000) throw new Error('Please wait a minute before sending another message.')
    sending = true
    try {
      const { uid, token } = await identity()
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Could not identify your session. Please reopen the app.')
      const payload = contributionPayload(input, uid, id)
      const recordPath = `${payload.collection}/${id}`
      const limitPath = `submission_limits/${uid}/${payload.collection}`
      const updates = {
        [recordPath]: payload.data,
        [limitPath]: { timestamp: serverTime, submissionId: id },
      }
      // A stable ID prevents a repeated tap/retry from creating another record.
      // REST requests are not queued for a surprise write after going online.
      // Server rules bind this record and its rate-limit ledger in one atomic
      // update. A new record alone cannot bypass the server's cooldown.
      const confirmation = await request(`${firebaseConfig.databaseURL}/.json?auth=${encodeURIComponent(token)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
      })
      // Firebase expands multi-location PATCH keys into nested response objects.
      const record = responseRecord(confirmation, [payload.collection, id])
      const limit = responseRecord(confirmation, ['submission_limits', uid, payload.collection])
      if (!record || !limit || limit.submissionId !== id || limit.timestamp !== record.timestamp
        || !Object.entries(payload.data).every(([key, value]) => key === 'timestamp'
          ? typeof record[key] === 'number' && Number.isFinite(record[key]) && Number(record[key]) > 0
          : JSON.stringify(record[key]) === JSON.stringify(value))) {
        throw new Error('The service did not confirm your submission. Please contact the project team before sending it again.')
      }
      lastSent = Date.now()
    } finally { sending = false }
  }
}

export const sendContribution = createContributionClient()
