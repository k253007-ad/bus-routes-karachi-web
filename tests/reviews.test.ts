import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReviewsClient } from '../src/backend/reviews';

const sample = { id: 1, routeId: 'R1', rating: 4, comment: 'Reliable bus service.', createdAt: '2026-10-21T10:00:00.000Z', authorId: '12345678' };
const envelope = (reviews: unknown[] = [sample], total = reviews.length) => ({
  success: true, data: reviews, pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20), hasMore: total > reviews.length },
});
const reply = (data: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(data), { status });
const client = (fetcher: typeof fetch) => createReviewsClient('https://example.com/api/v1/', () => 'device-12345678', fetcher);

test('lists using the query filter and the device header', async () => {
  const api = client(async (url, options) => {
    assert.equal(String(url), 'https://example.com/api/v1/reviews?routeId=R1&page=1&limit=20');
    assert.equal(new Headers(options?.headers).get('X-Device-Id'), 'device-12345678');
    assert.equal(options?.redirect, 'error');
    return new Response(JSON.stringify(envelope()));
  });
  assert.deepEqual(await api.list('R1'), { reviews: [sample], page: 1, hasMore: false, total: 1 });
});

test('an empty result is distinct from an unavailable service', async () => {
  assert.deepEqual(await client(reply(envelope([]))).list(undefined), { reviews: [], page: 1, hasMore: false, total: 0 });
  await assert.rejects(client(reply({}, 503)).list(undefined), /unavailable/);
  await assert.rejects(client(async () => { throw new TypeError('TLS certificate expired'); }).list(undefined), /unavailable/);
});

test('rejects untrusted shapes, pagination, duplicate reviews, and wrong route filters', async () => {
  for (const data of [
    { success: false }, {}, envelope([{ ...sample, routeId: 'R2' }]),
    envelope([{ ...sample, rating: 8 }]), envelope([{ ...sample, comment: 'x'.repeat(1001) }]),
    envelope([{ ...sample, createdAt: 'yesterday' }]), envelope([{ ...sample, id: {} }]),
    envelope([], 21), envelope([sample, sample]),
    { ...envelope(), pagination: { ...envelope().pagination, hasMore: true } },
    { ...envelope(), pagination: { ...envelope().pagination, page: 2 } },
    envelope(Array.from({ length: 21 }, () => sample)),
  ]) await assert.rejects(client(reply(data)).list('R1'), /invalid response/);
  await assert.rejects(client(async () => new Response('<html>gateway error</html>')).list(undefined), /invalid response/);
});

test('accepts a partial page when rows and count were read at different times', async () => {
  assert.deepEqual(await client(reply(envelope([sample], 21))).list('R1'), {
    reviews: [sample], page: 1, hasMore: true, total: 21,
  });
});

test('accepts multiline comments in both submissions and returned reviews', async () => {
  const multiline = { ...sample, comment: 'Comfortable buses.\r\nPlease improve\tthe timetable.' };
  assert.equal((await client(reply(envelope([multiline]))).list('R1')).reviews[0].comment, multiline.comment);
  await client(async (_url, options) => {
    assert.equal(JSON.parse(String(options?.body)).comment, multiline.comment);
    return new Response(JSON.stringify({ success: true, data: multiline }), { status: 201 });
  }).submit({ routeId: 'R1', rating: 4, comment: multiline.comment });
  await assert.rejects(client(reply(envelope([{ ...sample, authorId: 'author\nid' }]))).list('R1'), /invalid response/);
});

test('validates HTTPS service configuration and input before sending requests', async () => {
  for (const base of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?token=x', 'https://example.com/#x', 'invalid']) {
    assert.throws(() => createReviewsClient(base, () => 'device-12345678'), /HTTPS/);
  }
  const api = client(async () => { assert.fail('Invalid input must not be sent'); });
  await assert.rejects(api.list('x'.repeat(51)), /valid bus route/);
  await assert.rejects(api.list(undefined, 0), /valid reviews page/);
  await assert.rejects(api.submit({ rating: 0, comment: 'A useful comment.' }), /rating/);
  await assert.rejects(api.submit({ rating: 5, comment: 'tiny' }), /10–1000/);
});

test('submits one JSON request with trimmed comment and validates confirmation', async () => {
  let calls = 0;
  await client(async (_url, options) => {
    calls++;
    assert.equal(options?.method, 'POST');
    assert.equal(new Headers(options?.headers).get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(options?.body)), { routeId: 'R1', rating: 4, comment: sample.comment });
    return new Response(JSON.stringify({ success: true, data: sample }), { status: 201 });
  }).submit({ routeId: 'R1', rating: 4, comment: `  ${sample.comment}  ` });
  assert.equal(calls, 1);
  await assert.rejects(client(reply({ success: true })).submit({ rating: 4, comment: sample.comment }), /invalid response/);
  await assert.rejects(client(reply({ success: false })).submit({ rating: 4, comment: sample.comment }), /invalid response/);
});

test('provides rate limit and validation guidance without retrying writes', async () => {
  for (const [status, message] of [[429, /wait a few minutes/], [400, /not accepted/], [503, /unavailable/]] as const) {
    let calls = 0;
    const api = client(async () => { calls++; return new Response('{}', { status }); });
    await assert.rejects(api.submit({ rating: 5, comment: sample.comment }), message);
    assert.equal(calls, 1);
  }
});

test('aborts a stalled request after twelve seconds', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  const pending = client(async (_url, options) => {
    signal = options?.signal;
    return await new Promise<Response>(() => {});
  }).list(undefined);
  const assertion = assert.rejects(pending, /took too long/);
  context.mock.timers.tick(12_000);
  await assertion;
  assert.equal(signal?.aborted, true);
});
