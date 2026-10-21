import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, createWriteStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, get, ref, set, update, remove, serverTimestamp } from 'firebase/database';

// Intentionally fixed: this runner can never point at a real Firebase project.
const HOST = '127.0.0.1';
const PORT = 19000;
const PROJECT = 'demo-bustracking-security';
const NAMESPACE = `${PROJECT}-default-rtdb`;
assert.ok(PROJECT.startsWith('demo-'));
const base = new URL(`http://${HOST}:${PORT}/`);
assert.equal(base.hostname, '127.0.0.1');
const toolsDir = fileURLToPath(new URL('../../.android-build-tools/security-emulator/', import.meta.url));
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const apps = [];
let emulator;
let log;
let passed = 0;

async function localAdmin(path, method = 'GET', value) {
  const url = new URL(`${path}.json`, base);
  assert.equal(url.origin, base.origin);
  url.searchParams.set('ns', NAMESPACE);
  const response = await fetch(url, {
    method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  const text = await response.text();
  assert.ok(response.ok, `Emulator admin ${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function startEmulator() {
  const jar = join(toolsDir, 'firebase-database-emulator-v4.11.2.jar');
  assert.equal(createHash('sha256').update(await readFile(jar)).digest('hex'), 'b70d99344caf17c98b6f910fa8f6edf32a7c016cb1035e8915f70d38901eb97f', 'Use the official pinned emulator JAR documented in README.md');
  const jdkRoot = join(rootDir, '.android-build-tools', 'jdk');
  const localJdk = existsSync(jdkRoot) ? (await readdir(jdkRoot)).map(name => join(jdkRoot, name, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')).find(existsSync) : undefined;
  const java = localJdk || 'java';
  // Refuse to attach to or replace an unrelated process when --start is given.
  const { createServer } = await import('node:net');
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(PORT, HOST, resolve));
  await new Promise(resolve => probe.close(resolve));
  log = createWriteStream(join(toolsDir, 'database-emulator.log'));
  emulator = spawn(java, ['-Djava.net.preferIPv4Stack=true', '-jar', jar, '--host', HOST, '--port', String(PORT)], { cwd: toolsDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  emulator.stdout.pipe(log);
  emulator.stderr.pipe(log);
  let spawnError;
  emulator.once('error', error => { spawnError = error; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (emulator.exitCode !== null) throw new Error('Emulator exited: inspect .android-build-tools/security-emulator/database-emulator.log');
    try { await localAdmin('/'); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Local emulator did not start within 30 seconds');
}

function actor(uid, claims = {}) {
  const app = initializeApp({ projectId: PROJECT, databaseURL: `https://${NAMESPACE}.firebaseio.com` }, `rules-${uid ?? 'anonymous'}-${apps.length}`);
  apps.push(app);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, HOST, PORT, uid === null ? undefined : { mockUserToken: { sub: uid, user_id: uid, ...claims } });
  return db;
}

const ID = 'a'.repeat(32);
function payload(collection, uid, id = ID) {
  if (collection === 'feedback') return { input: 'Please improve this route.', type: 'suggestion', timestamp: serverTimestamp(), deviceId: uid };
  if (collection === 'bus_feedback') return { comment: 'The stop information is outdated.', feed: 'outdated', feedType: 'outdated', routeId: 'R1', timestamp: serverTimestamp(), deviceId: uid };
  return { id, busName: 'New route', busType: 'red', startStop: 'Tower', endStop: 'Saddar', intermediateStops: ['First stop', 'Second stop'], timestamp: serverTimestamp(), userId: uid, status: 'pending' };
}
function atomic(collection, uid, id = ID, change = {}) {
  return {
    [`${collection}/${id}`]: { ...payload(collection, uid, id), ...change },
    [`submission_limits/${uid}/${collection}`]: { timestamp: serverTimestamp(), submissionId: id },
  };
}
async function allowed(label, operation) {
  await operation();
  console.log(`PASS allow: ${label}`);
  passed++;
}
async function denied(label, operation) {
  await assert.rejects(operation, error => /permission.denied|permission_denied/i.test(`${error.code} ${error.message}`), label);
  console.log(`PASS deny: ${label}`);
  passed++;
}

try {
  if (process.argv.includes('--start')) await startEmulator();
  const source = JSON.parse(await readFile(new URL('./database.rules.json', import.meta.url), 'utf8'));
  // Load/compile the actual candidate, then seed only this isolated demo namespace.
  await localAdmin('/.settings/rules', 'PUT', source);
  await localAdmin('/', 'PUT', { admins: { moderator: true, disabled: false, stringGrant: 'true' }, route_list: ['R1@Bus@@red@opr@S1@S2'], db_version: 1 });
  const anonymous = actor(null);
  const guest = actor('guest');
  const moderator = actor('moderator');
  const disabled = actor('disabled');
  const stringGrant = actor('stringGrant');
  const collections = ['feedback', 'bus_feedback', 'stops_pending'];

  await allowed('public transit reads without authentication', () => get(ref(anonymous, 'route_list')));
  await denied('public transit writes by guest', () => set(ref(guest, 'db_version'), 99));
  await denied('public transit writes by unauthenticated user', () => set(ref(anonymous, 'db_version'), 99));
  await allowed('trusted moderator updates public route data', () => set(ref(moderator, 'db_version'), 2));
  await denied('guest cannot bootstrap admin membership', () => set(ref(guest, 'admins/guest'), true));
  await denied('moderator cannot mint other admins through client', () => set(ref(moderator, 'admins/new-admin'), true));
  await denied('false admin grant is not authorization', () => set(ref(disabled, 'db_version'), 3));
  await denied('string admin grant is not authorization', () => set(ref(stringGrant, 'db_version'), 3));
  await denied('unverified email claim does not authorize', () => set(ref(actor('unverified', { email: 'legacy-admin@example.invalid', email_verified: false }), 'db_version'), 3));

  // Exercise the exact REST root-PATCH protocol used by the app, including its
  // nested response and server timestamp confirmation contract.
  const seconds = Math.floor(Date.now() / 1000);
  const mockToken = uid => [
    { alg: 'none', typ: 'JWT' },
    { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, iat: seconds, exp: seconds + 3600, auth_time: seconds, sub: uid, user_id: uid, firebase: { sign_in_provider: 'custom', identities: {} } },
  ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.';
  const restUrl = new URL('.json', base);
  restUrl.searchParams.set('ns', NAMESPACE);
  restUrl.searchParams.set('auth', mockToken('rest-guest'));
  await localAdmin('/feedback/private-sibling', 'PUT', { input: 'An existing private submission', type: 'other', deviceId: 'other-guest', timestamp: 1 });
  await localAdmin('/submission_limits/other-guest/feedback', 'PUT', { timestamp: 1, submissionId: 'private-sibling' });
  const restId = 'f'.repeat(32);
  const restPatch = atomic('feedback', 'rest-guest', restId);
  const restResponse = await fetch(restUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(restPatch), redirect: 'error', signal: AbortSignal.timeout(15000) });
  const restEcho = await restResponse.json();
  assert.equal(restResponse.status, 200, `Guest REST PATCH failed: ${JSON.stringify(restEcho)}`);
  assert.deepEqual(Object.keys(restEcho).sort(), ['feedback', 'submission_limits']);
  assert.deepEqual(Object.keys(restEcho.feedback), [restId], 'REST write echo must not expose private siblings');
  assert.deepEqual(Object.keys(restEcho.submission_limits), ['rest-guest']);
  assert.deepEqual(Object.keys(restEcho.submission_limits['rest-guest']), ['feedback']);
  assert.equal(typeof restEcho.feedback[restId].timestamp, 'number');
  assert.equal(restEcho.feedback[restId].timestamp, restEcho.submission_limits['rest-guest'].feedback.timestamp);
  assert.equal(restEcho.submission_limits['rest-guest'].feedback.submissionId, restId);
  console.log('PASS allow: actual REST PATCH returns nested objects and matching resolved timestamps');
  passed++;

  const mixedId = '9'.repeat(32);
  restUrl.searchParams.set('auth', mockToken('rest-mixed'));
  const mixedPatch = { ...atomic('feedback', 'rest-mixed', mixedId), ...atomic('bus_feedback', 'rest-mixed', mixedId) };
  const mixedResponse = await fetch(restUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mixedPatch), redirect: 'error', signal: AbortSignal.timeout(15000) });
  const mixedEcho = await mixedResponse.json();
  assert.equal(mixedResponse.status, 200);
  assert.deepEqual(Object.keys(mixedEcho).sort(), ['bus_feedback', 'feedback', 'submission_limits']);
  assert.deepEqual(Object.keys(mixedEcho.feedback), [mixedId]);
  assert.deepEqual(Object.keys(mixedEcho.bus_feedback), [mixedId]);
  assert.deepEqual(Object.keys(mixedEcho.submission_limits), ['rest-mixed']);
  assert.deepEqual(Object.keys(mixedEcho.submission_limits['rest-mixed']).sort(), ['bus_feedback', 'feedback']);
  console.log('PASS allow: mixed collection REST PATCH exposes only submitted records and own updated ledgers');
  passed++;

  for (const collection of collections) {
    await denied(`${collection}: unauthenticated atomic create`, () => update(ref(anonymous), atomic(collection, 'guest')));
    await denied(`${collection}: legacy PUT without ledger`, () => set(ref(guest, `${collection}/${ID}`), payload(collection, 'guest')));
    await denied(`${collection}: spoofed owner`, () => update(ref(guest), atomic(collection, 'guest', ID, collection === 'stops_pending' ? { userId: 'victim' } : { deviceId: 'victim' })));
    await denied(`${collection}: privileged extra field`, () => update(ref(guest), atomic(collection, 'guest', ID, { isAdmin: true })));
    await denied(`${collection}: guest adminNotes`, () => update(ref(guest), atomic(collection, 'guest', ID, { adminNotes: 'Forged moderator note' })));
    await denied(`${collection}: spoofed approved status`, () => update(ref(guest), atomic(collection, 'guest', ID, { status: 'approved' })));
    await denied(`${collection}: wrong field type`, () => update(ref(guest), atomic(collection, 'guest', ID, collection === 'feedback' ? { input: { value: 'malformed' } } : collection === 'bus_feedback' ? { comment: 123 } : { startStop: [] })));
    await denied(`${collection}: oversized text`, () => update(ref(guest), atomic(collection, 'guest', ID, collection === 'feedback' ? { input: 'x'.repeat(1001) } : collection === 'bus_feedback' ? { comment: 'x'.repeat(501) } : { busName: 'x'.repeat(51) })));
    await denied(`${collection}: backdated record timestamp`, () => update(ref(guest), atomic(collection, 'guest', ID, { timestamp: Date.now() - 1000 })));
    await denied(`${collection}: missing required field`, () => {
      const patch = atomic(collection, 'guest');
      delete patch[`${collection}/${ID}`].timestamp;
      return update(ref(guest), patch);
    });
    await denied(`${collection}: mismatched ledger submission ID`, () => {
      const patch = atomic(collection, 'guest');
      patch[`submission_limits/guest/${collection}`].submissionId = 'b'.repeat(32);
      return update(ref(guest), patch);
    });
    await denied(`${collection}: two records in one atomic batch`, () => update(ref(guest), { ...atomic(collection, 'guest'), [`${collection}/${'b'.repeat(32)}`]: payload(collection, 'guest', 'b'.repeat(32)) }));
    await denied(`${collection}: ledger alone`, () => set(ref(guest, `submission_limits/guest/${collection}`), { timestamp: serverTimestamp(), submissionId: ID }));
    await denied(`${collection}: ledger backdating`, () => {
      const patch = atomic(collection, 'guest');
      patch[`submission_limits/guest/${collection}`].timestamp = Date.now() - 1000000;
      return update(ref(guest), patch);
    });
    await allowed(`${collection}: valid atomic create`, () => update(ref(guest), atomic(collection, 'guest')));
    await denied(`${collection}: immediate second submission`, () => update(ref(guest), atomic(collection, 'guest', 'b'.repeat(32))));
    await denied(`${collection}: overwrite own submitted record`, () => set(ref(guest, `${collection}/${ID}`), payload(collection, 'guest')));
    await denied(`${collection}: delete own submitted record`, () => remove(ref(guest, `${collection}/${ID}`)));
    await denied(`${collection}: delete cooldown ledger`, () => remove(ref(guest, `submission_limits/guest/${collection}`)));
    await denied(`${collection}: backdate existing cooldown ledger`, () => update(ref(guest, `submission_limits/guest/${collection}`), { timestamp: 1 }));
    await denied(`${collection}: private collection read by guest`, () => get(ref(guest, collection)));
    await denied(`${collection}: private own-record read by guest`, () => get(ref(guest, `${collection}/${ID}`)));
    await denied(`${collection}: private read without authentication`, () => get(ref(anonymous, collection)));
    await denied(`${collection}: disabled admin read`, () => get(ref(disabled, collection)));
    await allowed(`${collection}: trusted moderator read`, () => get(ref(moderator, collection)));
    await allowed(`${collection}: trusted moderator status and notes`, () => update(ref(moderator, `${collection}/${ID}`), { status: collection === 'stops_pending' ? 'approved' : 'resolved', adminNotes: 'Reviewed by moderator' }));
    await denied(`${collection}: moderator cannot mutate original owner`, () => update(ref(moderator, `${collection}/${ID}`), collection === 'stops_pending' ? { userId: 'victim' } : { deviceId: 'victim' }));
    await allowed(`${collection}: own ledger readable`, () => get(ref(guest, `submission_limits/guest/${collection}`)));
    await denied(`${collection}: other user ledger hidden`, () => get(ref(actor(`outsider-${collection}`), `submission_limits/guest/${collection}`)));
    await localAdmin(`/submission_limits/guest/${collection}`, 'PUT', { timestamp: Date.now() - 600000, submissionId: ID });
    await allowed(`${collection}: submission after historically seeded cooldown`, () => update(ref(guest), atomic(collection, 'guest', 'c'.repeat(32))));
  }

  const special = actor('special');
  const specialId = '7'.repeat(32);
  await denied('route: submission ID must match path', () => update(ref(special), atomic('stops_pending', 'special', specialId, { id: 'wrong-id-value' })));
  await denied('route: 101 intermediate stops rejected', () => update(ref(special), atomic('stops_pending', 'special', specialId, { intermediateStops: Array.from({ length: 101 }, () => 'Valid stop') })));
  await denied('route: named intermediate stop key rejected', () => update(ref(special), atomic('stops_pending', 'special', specialId, { intermediateStops: { pollution: 'Valid stop' } })));
  await denied('route: too-short intermediate stop rejected', () => update(ref(special), atomic('stops_pending', 'special', specialId, { intermediateStops: ['ab'] })));
  await denied('issue: feed and feedType mismatch rejected', () => update(ref(special), atomic('bus_feedback', 'special', specialId, { feedType: 'wrong_stops' })));
  await denied('legacy contribution path cannot bypass ledger', () => set(ref(special, `pending_bus_submissions/${ID}`), payload('stops_pending', 'special')));
  await denied('old writable rate_limits path is closed', () => set(ref(special, 'rate_limits/special/feedback'), 1));
  await denied('unknown ledger collection rejected', () => update(ref(special), { [`private/${ID}`]: { timestamp: serverTimestamp(), deviceId: 'special' }, 'submission_limits/special/private': { timestamp: serverTimestamp(), submissionId: ID } }));
  await denied('ledger injected extra field rejected', () => {
    const patch = atomic('feedback', 'special', specialId);
    patch['submission_limits/special/feedback'].admin = true;
    return update(ref(special), patch);
  });
  await denied('mixed update cannot smuggle public data write alongside valid contribution', () => update(ref(special), { ...atomic('feedback', 'special', specialId), db_version: 999 }));
  assert.equal(await localAdmin(`/feedback/${specialId}`), null, 'Rejected mixed write must not create a record');
  assert.equal(await localAdmin('/submission_limits/special/feedback'), null, 'Rejected mixed write must not advance a ledger');
  await allowed('route: optional intermediate stops may be omitted', () => {
    const patch = atomic('stops_pending', 'special', specialId);
    delete patch[`stops_pending/${specialId}`].intermediateStops;
    return update(ref(special), patch);
  });
  await allowed('route: 100 bounded intermediate stops accepted', () => update(ref(actor('hundred')), atomic('stops_pending', 'hundred', '8'.repeat(32), { intermediateStops: Array.from({ length: 100 }, () => 'Valid stop') })));
  await allowed('trusted moderator can delete reviewed submission', () => remove(ref(moderator, `stops_pending/${ID}`)));
  await denied('moderator deletion does not reset guest cooldown', () => update(ref(guest), atomic('stops_pending', 'guest', ID)));
  const concurrent = actor('concurrent');
  const results = await Promise.allSettled([
    update(ref(concurrent), atomic('feedback', 'concurrent', 'd'.repeat(32))),
    update(ref(concurrent), atomic('feedback', 'concurrent', 'e'.repeat(32))),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent submissions must allow exactly one record');
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  console.log('PASS deny: concurrent second submission is rejected atomically');
  passed++;
  console.log(`\n${passed} real Realtime Database emulator checks passed; no production services used.`);
} finally {
  await Promise.allSettled(apps.map(deleteApp));
  if (emulator) emulator.kill();
  if (log) log.end();
}
