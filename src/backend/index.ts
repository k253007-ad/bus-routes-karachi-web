import { reviewsApiUrl } from './config'
import { createReviewsClient } from './reviews'

export function newSubmissionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
}

let installationId: string | undefined
function reviewDeviceId() {
  if (installationId) return installationId
  try {
    const saved = localStorage.getItem('konis-review-device-v1')
    if (saved && /^[a-f0-9]{32}$/.test(saved)) return installationId = saved
  } catch { /* Storage may be disabled; retain the identity for this session. */ }
  installationId = newSubmissionId()
  try { localStorage.setItem('konis-review-device-v1', installationId) } catch { /* Session identity still works. */ }
  return installationId
}

let client: ReturnType<typeof createReviewsClient> | undefined
function reviews() { return client ||= createReviewsClient(reviewsApiUrl, reviewDeviceId) }

export const listReviews = (routeId?: string, page = 1) => reviews().list(routeId, page)
export const submitReview = (input: { routeId?: string; rating: number; comment: string }) => reviews().submit(input)
