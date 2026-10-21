import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { busTypes } from './data'
import { newSubmissionId, listReviews, submitReview } from './backend'
import { sendContribution } from './backend/contributions'
import type { Contribution } from './backend/contributions'
import type { Review } from './backend/reviews'

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Could not send your message. Please try again.'
}

export function ContributionForm({ routeId, isRoute = false }: { routeId?: string; isRoute?: boolean }) {
  const [name, setName] = useState('')
  const [busType, setBusType] = useState('bus')
  const [startStop, setStartStop] = useState('')
  const [endStop, setEndStop] = useState('')
  const [details, setDetails] = useState('')
  const [category, setCategory] = useState('other')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const busy = useRef(false)
  const draft = useRef({ fingerprint: '', id: '' })
  const maxLength = routeId ? 500 : 1000

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current || sent) return
    const input: Contribution = isRoute
      ? { kind: 'route', name, busType, startStop, endStop, intermediateStops: details }
      : routeId
        ? { kind: 'issue', routeId, details, category: category as 'other' }
        : { kind: 'feedback', details, category: category as 'other' }
    busy.current = true
    setSending(true)
    setError('')
    try {
      const fingerprint = JSON.stringify(input)
      if (draft.current.fingerprint !== fingerprint) draft.current = { fingerprint, id: newSubmissionId() }
      await sendContribution(input, draft.current.id)
      setSent(true)
    } catch (error) { setError(message(error)) }
    finally { busy.current = false; setSending(false) }
  }

  if (sent) return <div className="empty-state submission-success" role="status"><h2>{isRoute ? 'Route suggestion sent' : 'Thank you for your message'}</h2><p>{isRoute ? 'The project team will review your suggestion before adding it to the route list.' : 'Your message has been sent to the project team.'}</p></div>
  return <form className="contribution-card" onSubmit={submit} aria-busy={sending}>
    <fieldset className="backend-fields" disabled={sending}>
      {isRoute ? <>
        <label>Bus or route name<input required value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={50} placeholder="For example, Route 10" /></label>
        <label>Bus type<select value={busType} onChange={event => setBusType(event.target.value)}>{busTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <label>Starting stop<input required value={startStop} onChange={event => setStartStop(event.target.value)} minLength={3} maxLength={100} /></label>
        <label>Destination stop<input required value={endStop} onChange={event => setEndStop(event.target.value)} minLength={3} maxLength={100} /></label>
      </> : <label>{routeId ? 'What needs fixing?' : 'Message type'}<select value={category} onChange={event => setCategory(event.target.value)}>{(routeId ? [['wrong_stops', 'Incorrect stops'], ['outdated', 'Outdated information'], ['missing_info', 'Missing information'], ['other', 'Something else']] : [['suggestion', 'Suggestion'], ['bug', 'App problem'], ['other', 'Something else']]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
      <label>{isRoute ? 'Stops along the way (optional)' : 'Your message'}<textarea required={!isRoute} value={details} onChange={event => setDetails(event.target.value)} minLength={isRoute ? undefined : 10} maxLength={isRoute ? 10_000 : maxLength} rows={6} placeholder={isRoute ? 'Enter each stop on a new line.' : 'Describe the problem or suggestion in at least 10 characters.'} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="form-help">Your message is sent directly to the project team. An internet connection is needed.</p>
      <button className="wide-button" type="submit">{sending ? 'Sending…' : isRoute ? 'Send Route Suggestion' : 'Send Message'}</button>
    </fieldset>
  </form>
}

export function ReviewComposer({ routeId, onSubmitted }: { routeId?: string; onSubmitted?: () => void }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const busy = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current || sent) return
    busy.current = true
    setSending(true)
    setError('')
    try {
      await submitReview({ routeId, rating, comment })
      setSent(true)
      onSubmitted?.()
    } catch (error) { setError(message(error)) }
    finally { busy.current = false; setSending(false) }
  }
  if (sent) return <div className="empty-state submission-success" role="status"><h2>Review submitted</h2><p>Thank you for sharing your experience.</p></div>
  return <form className="contribution-card review-composer" onSubmit={submit} aria-busy={sending}>
    <h2>Share your experience</h2>
    <fieldset className="backend-fields" disabled={sending}>
      <label>Your rating<select value={rating} onChange={event => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} {value === 1 ? 'star' : 'stars'}</option>)}</select></label>
      <label>Your review<textarea required minLength={10} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} rows={5} placeholder="What would help someone taking this bus?" /></label>
      <p className="form-help">Write 10–1000 characters. Keep links, phone numbers, and email addresses out of your review.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="wide-button">{sending ? 'Submitting…' : 'Submit Review'}</button>
    </fieldset>
  </form>
}

export function ReviewsPanel({ routeId }: { routeId: string }) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const request = useRef(0)
  async function load(nextPage: number) {
    const currentRequest = ++request.current
    setLoading(true)
    setError('')
    try {
      const result = await listReviews(routeId, nextPage)
      if (currentRequest !== request.current) return
      setReviews(previous => nextPage === 1 ? result.reviews : [...previous, ...result.reviews.filter(item => !previous.some(old => old.id === item.id))])
      setPage(result.page)
      setTotal(result.total)
      setHasMore(result.hasMore)
    } catch (error) { if (currentRequest === request.current) setError(message(error)) }
    finally { if (currentRequest === request.current) setLoading(false) }
  }
  useEffect(() => {
    setReviews([])
    setPage(0)
    setHasMore(false)
    void load(1)
    return () => { ++request.current }
  }, [routeId, refresh])

  return <div className="reviews-panel">
    <section className="review-list" aria-label="Passenger reviews" aria-busy={loading}>
      {page > 0 && <h2>{total} {total === 1 ? 'review' : 'reviews'}</h2>}
      {reviews.map(review => <article className="review-card" key={review.id}><div className="review-heading"><strong aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time></div><p>{review.comment}</p><small>Passenger · {review.authorId}</small></article>)}
      {loading && <p role="status">Loading reviews…</p>}
      {error && <div className="empty-state"><p className="form-error" role="alert">{error}</p><button className="outline-button" type="button" onClick={() => void load(page ? page + 1 : 1)}>Try Again</button></div>}
      {!loading && !error && page > 0 && !reviews.length && <div className="empty-state"><h2>No reviews yet</h2><p>Be the first to share your experience.</p></div>}
      {hasMore && !error && <button className="outline-button" type="button" disabled={loading} onClick={() => void load(page + 1)}>More Reviews</button>}
    </section>
    <ReviewComposer key={routeId} routeId={routeId} onSubmitted={() => setRefresh(value => value + 1)} />
  </div>
}
