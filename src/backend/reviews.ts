export interface Review {
  id: string | number;
  routeId: string | null;
  rating: number;
  comment: string;
  createdAt: string;
  authorId: string;
}

export interface ReviewPage {
  reviews: Review[];
  page: number;
  hasMore: boolean;
  total: number;
}

const LIMIT = 20;
const invalidResponse = () => new Error('The reviews service returned an invalid response. Please try again later.');
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const commentText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 1000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);

function review(value: unknown): Review {
  if (!record(value)
    || !(integer(value.id) && value.id > 0 || text(value.id, 100))
    || !(value.routeId === null || text(value.routeId, 50))
    || !integer(value.rating) || value.rating < 1 || value.rating > 5
    || !commentText(value.comment) || !text(value.authorId, 100)
    || !text(value.createdAt, 40) || !/^\d{4}-\d{2}-\d{2}T/.test(value.createdAt)
    || !Number.isFinite(Date.parse(value.createdAt))) throw invalidResponse();
  return {
    id: value.id, routeId: value.routeId, rating: value.rating,
    comment: value.comment, createdAt: value.createdAt, authorId: value.authorId,
  };
}

function validateRoute(routeId: string | undefined): void {
  if (routeId !== undefined && (!text(routeId, 50) || /[<>]/.test(routeId) || routeId !== routeId.trim())) {
    throw new Error('Choose a valid bus route before continuing.');
  }
}

export function createReviewsClient(baseUrl: string, deviceId: () => string, fetcher: typeof fetch = fetch) {
  let base: URL;
  try { base = new URL(baseUrl); } catch { throw new Error('Configure a valid HTTPS reviews service URL.'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('Configure a valid HTTPS reviews service URL without credentials, query parameters, or a fragment.');
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;

  async function request(url: URL, body?: object): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('The reviews service took too long to respond. Check your connection and try again.'));
      }, 12_000);
    });
    const operation = async () => {
      const id = deviceId();
      if (!text(id, 100) || id.length < 8) throw new Error('Unable to identify this device. Restart the app and try again.');
      let response: Response;
      try {
        response = await fetcher(url.toString(), {
          method: body ? 'POST' : 'GET', signal: controller.signal, redirect: 'error',
          headers: { Accept: 'application/json', 'X-Device-Id': id, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw new Error('The reviews service is unavailable. Check your connection and try again later.');
      }
      if (response.status === 429) throw new Error('Too many reviews submitted. Please wait a few minutes before trying again.');
      if (response.status >= 500) throw new Error('The reviews service is unavailable. Please try again later.');
      if (!response.ok) {
        throw new Error(response.status === 400
          ? 'Your review was not accepted. Use a rating from 1 to 5 and a 10–1000 character comment without links, contact details, or spam.'
          : 'The reviews request failed. Please try again later.');
      }
      let data: unknown;
      try {
        data = await boundedJson(response, 100_000);
      } catch { throw invalidResponse(); }
      if (!record(data) || data.success !== true) throw invalidResponse();
      return data;
    };
    try { return await Promise.race([operation(), timeout]); }
    finally { clearTimeout(timer); }
  }

  return {
    async list(routeId: string | undefined, page = 1): Promise<ReviewPage> {
      validateRoute(routeId);
      if (!integer(page) || page < 1 || page > 1_000_000) throw new Error('Choose a valid reviews page.');
      // The legacy /reviews/:routeId handler ignores its path parameter.
      const url = new URL('reviews', base);
      if (routeId !== undefined) url.searchParams.set('routeId', routeId);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(LIMIT));
      const data = await request(url);
      if (!Array.isArray(data.data) || data.data.length > LIMIT || !record(data.pagination)) throw invalidResponse();
      const reviews = data.data.map(review);
      if (routeId !== undefined && reviews.some(item => item.routeId !== routeId)) throw invalidResponse();
      const pagination = data.pagination;
      const offset = (page - 1) * LIMIT;
      if (pagination.page !== page || pagination.limit !== LIMIT
        || !integer(pagination.total) || pagination.total < 0
        || pagination.totalPages !== Math.ceil(pagination.total / LIMIT)
        || pagination.hasMore !== (offset + reviews.length < pagination.total)
        || (reviews.length === 0 && pagination.hasMore)
        || new Set(reviews.map(item => String(item.id))).size !== reviews.length) throw invalidResponse();
      return { reviews, page, hasMore: pagination.hasMore as boolean, total: pagination.total };
    },
    async submit(input: { routeId?: string; rating: number; comment: string }): Promise<void> {
      validateRoute(input.routeId);
      if (!integer(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Choose a rating from 1 to 5 stars.');
      const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
      if (comment.length < 10 || !commentText(comment) || /[<>]/.test(comment)) {
        throw new Error('Write a comment of 10–1000 characters without HTML or control characters.');
      }
      const data = await request(new URL('reviews', base), { ...input, comment });
      const created = review(data.data);
      if (created.routeId !== (input.routeId ?? null) || created.rating !== input.rating) throw invalidResponse();
    },
  };
}
import { boundedJson } from './json'
