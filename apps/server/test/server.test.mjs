import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';
import { prepareInput } from '../src/input.mjs';
import { validateAlignments } from '../src/alignment.mjs';
import { requestAlignment } from '../src/provider.mjs';
import { createBudget } from '../src/budget.mjs';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';

const input = {
  oldSteps: [{ id: 'old-1', index: 0, description: 'Click Invite', action: 'click', url: 'https://example.test/team' }],
  newSteps: [{ id: 'new-1', index: 0, description: 'Click Add member', action: 'click', url: 'https://example.test/team' }],
};
const alignment = { oldId: 'old-1', newId: 'new-1', kind: 'changed', reason: 'The invitation button was renamed.', description: 'Click Add member.', uncertainty: '' };
const fakeReply = (data = { alignments: [alignment] }, extra = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 100, completion_tokens: 50 }, ...extra }), { headers: { 'Content-Type': 'application/json' } });
const enabled = (overrides = {}) => ({ ...loadConfig({ NEBIUS_API_KEY: 'test-key-not-a-real-credential', NEBIUS_FREE_CREDIT_CONFIRMED: 'true', NEBIUS_CREDIT_EXPIRES_AT: '2099-01-01T00:00:00Z', NEBIUS_CONFIRMED_FREE_USD: '25', GUIDEPATCH_RESERVE_USD: '15', GUIDEPATCH_BUDGET_USD: '1', GUIDEPATCH_PORT: '0', GUIDEPATCH_DB_PATH: ':memory:' }), ...overrides });

async function start(t, config = enabled(), fetchImpl = async () => fakeReply()) {
  const app = createApp({ config, fetchImpl });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    base,
    status: async () => (await fetch(`${base}/api/status`)).json(),
    align: (body = input, headers = {}) => fetch(`${base}/api/align`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
  };
}

test('defaults do not allow inference and do not expose configuration secrets', async (t) => {
  const app = await start(t, { ...loadConfig({}), databasePath: ':memory:' }, () => { throw new Error('must_not_call'); });
  const status = await app.status();
  assert.equal(status.configured, false);
  assert.equal(status.enabled, false);
  assert.equal(status.budgetUsd, 0);
  assert.equal((await app.align()).status, 503);
  assert.equal(JSON.stringify(status).includes('apiKey'), false);
});

test('a key alone does not authorize spending', async (t) => {
  const app = await start(t, enabled({ freeCreditConfirmed: false }));
  assert.equal((await app.status()).configured, true);
  assert.equal((await app.status()).enabled, false);
  assert.equal((await app.align()).status, 503);
});

test('missing or expired free-credit validity blocks calls before the provider', async (t) => {
  const expired = await start(t, enabled({ creditExpiresAt: Date.now() - 1000 }), () => { throw new Error('must_not_call'); });
  assert.equal((await expired.status()).enabled, false);
  assert.equal((await expired.align()).status, 503);
  const missing = await start(t, enabled({ creditExpiresAt: NaN }), () => { throw new Error('must_not_call'); });
  assert.equal((await missing.status()).enabled, false);
  assert.equal((await missing.align()).status, 503);
  assert.equal((await missing.status()).liveCalls, 0);
});

test('two phases and ledger connections share the same free-credit allowance', () => {
  const path = fileURLToPath(new URL(`../data/test-ledgers/${randomUUID()}.sqlite`, import.meta.url));
  const development = createBudget(path, 1, 'development', 1);
  const judging = createBudget(path, 1, 'judging', 1);
  development.reserve('development', 'test', 800_000);
  assert.equal(judging.status().remainingUsd, .2);
  assert.throws(() => judging.reserve('judging', 'test', 800_000), /budget_exhausted/);
  judging.reserve('judging-small', 'test', 100_000);
  assert.equal(development.status().remainingUsd, .1);
  development.close(); judging.close();
});

test('unknown confirmed balance and reserved safety margin prevent dispatch', async (t) => {
  const app = await start(t, enabled({ sharedAllowanceUsd: 0 }), () => { throw new Error('must_not_call'); });
  assert.equal((await app.status()).enabled, false);
  assert.equal((await app.align()).status, 429);
  assert.equal((await app.status()).liveCalls, 0);
});

test('public access requires HTTPS while local development may use HTTP', () => {
  const token = 'synthetic-test-access-token-123456';
  assert.throws(() => loadConfig({ GUIDEPATCH_PUBLIC_ORIGIN: 'http://demo.example', GUIDEPATCH_ACCESS_TOKEN: token }), /requires_https/);
  assert.equal(loadConfig({ GUIDEPATCH_PUBLIC_ORIGIN: 'http://localhost:4318' }).publicOrigin, 'http://localhost:4318');
  assert.equal(loadConfig({ GUIDEPATCH_PUBLIC_ORIGIN: 'https://demo.example', GUIDEPATCH_ACCESS_TOKEN: token }).publicOrigin, 'https://demo.example');
});

test('a running service rechecks credit expiry before every dispatch', async (t) => {
  const actualNow=Date.now;
  const started=actualNow();
  let calls=0;
  const app=await start(t,enabled({creditExpiresAt:started+360_000}),()=>{calls++;return fakeReply();});
  assert.equal((await app.status()).enabled,true);
  try{
    Date.now=()=>started+61_000;
    assert.equal((await app.status()).enabled,false);
    assert.equal((await app.align()).status,503);
    assert.equal(calls,0);
  }finally{Date.now=actualNow;}
});

test('valid provider response has real source metadata and records only the list-price estimate', async (t) => {
  let outgoing;
  const app = await start(t, enabled(), async (url, options) => {
    outgoing = { url, body: JSON.parse(options.body) };
    return fakeReply();
  });
  const response = await app.align();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, 'nebius');
  assert.deepEqual(result.alignments, [alignment]);
  assert.equal(result.estimatedCostUsd, 0.000018);
  assert.equal(outgoing.url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
  assert.equal(outgoing.body.max_tokens, 4096);
  assert.deepEqual(outgoing.body.response_format, { type: 'json_object' });
  assert.equal((await app.status()).liveCalls, 1);
  assert.equal((await app.status()).remainingUsd, 0.999982);
  assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('request text is limited and strips common credentials, email addresses, URL queries and fragments', () => {
  const result = prepareInput({ oldSteps: [{ ...input.oldSteps[0], description: 'Email person@example.com; token="secret123"; password: abc; Bearer abcdefghijk', url: 'https://user:pass@example.test/team?secret=abc#private', inputValue: 'must-not-travel', extra: 'must-not-travel' }], newSteps: [] });
  assert.equal(result.oldSteps[0].url, 'https://example.test/team');
  assert.equal(JSON.stringify(result).includes('secret123'), false);
  assert.equal(JSON.stringify(result).includes('person@example.com'), false);
  assert.equal(JSON.stringify(result).includes('must-not-travel'), false);
  assert.throws(() => prepareInput({ ...input, oldSteps: [{ ...input.oldSteps[0], description: 'x'.repeat(1601) }] }), /invalid_step_description/);
  assert.throws(() => prepareInput({ ...input, oldSteps: Array(81).fill(input.oldSteps[0]) }), /80_steps/);
  assert.throws(() => prepareInput({ ...input, oldSteps: [input.oldSteps[0], input.oldSteps[0]] }), /duplicate/);
});

test('model references must cover each step once and keep addition/removal direction', () => {
  assert.throws(() => validateAlignments({ alignments: [{ ...alignment, oldId: 'invented' }] }, input), /reference/);
  assert.throws(() => validateAlignments({ alignments: [alignment, alignment] }, input), /reference/);
  assert.throws(() => validateAlignments({ alignments: [] }, input), /coverage/);
  assert.throws(() => validateAlignments({ alignments: [{ ...alignment, kind: 'added' }] }, input), /kind/);
  const added = { ...alignment, oldId: null, kind: 'added' };
  assert.deepEqual(validateAlignments({ alignments: [added] }, { oldSteps: [], newSteps: input.newSteps }), [added]);
});

test('bad input never reaches the provider or reserves budget', async (t) => {
  const app = await start(t, enabled(), () => { throw new Error('must_not_call'); });
  assert.equal((await app.align({ oldSteps: 'bad', newSteps: [] })).status, 400);
  const malformed = await fetch(`${app.base}/api/align`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const large = await app.align({ oldSteps: [], newSteps: [], padding: 'x'.repeat(205_000) });
  assert.equal(large.status, 413);
  assert.equal((await app.status()).remainingUsd, 1);
  assert.equal((await app.status()).liveCalls, 0);
});

test('unknown model IDs fail closed and known usage remains accounted', async (t) => {
  const app = await start(t, enabled(), async () => fakeReply({ alignments: [{ ...alignment, newId: 'invented' }] }));
  const response = await app.align();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'model_step_reference_invalid');
  const status = await app.status();
  assert.equal(status.remainingUsd, 0.999982);
  assert.equal(status.lastError, 'model_step_reference_invalid');
});

test('invalid model JSON is an error, not a fake successful alignment', async (t) => {
  const app = await start(t, enabled(), async () => fakeReply(null, { choices: [{ finish_reason: 'stop', message: { content: '```json\n{not-json}\n```' } }] }));
  const response = await app.align();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'provider_invalid_json');
  assert.equal((await app.status()).remainingUsd, 0.999982);
});

test('provider 429 does not retry or expose its raw body and keeps its reservation', async (t) => {
  let calls = 0;
  const app = await start(t, enabled(), async () => { calls += 1; return new Response('sensitive provider details', { status: 429 }); });
  const response = await app.align();
  assert.equal(response.status, 429);
  const result = await response.text();
  assert.match(result, /provider_rate_limited/);
  assert.doesNotMatch(result, /sensitive/);
  assert.equal(calls, 1);
  const remaining = (await app.status()).remainingUsd;
  assert.ok(remaining < 0.999 && remaining > 0.9);
});

test('provider timeout retains reserved spend and reports a bounded failure', async (t) => {
  const app = await start(t, enabled({ timeoutMs: 15 }), async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const response = await app.align();
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, 'provider_timeout');
  assert.ok((await app.status()).remainingUsd < 0.999);
});

test('insufficient budget refuses before dispatch', async (t) => {
  const app = await start(t, enabled({ budgetUsd: 0.000001 }), () => { throw new Error('must_not_call'); });
  const response = await app.align();
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'budget_exhausted');
  assert.equal((await app.status()).liveCalls, 0);
});

test('concurrent requests cannot spend the same remaining budget', async (t) => {
  const config = enabled();
  const reserved = requestAlignment(config, prepareInput(input)).reservedMicros;
  let release;
  let dispatched;
  const began = new Promise((resolve) => { dispatched = resolve; });
  const app = await start(t, { ...config, budgetUsd: reserved / 1_000_000 }, async () => {
    dispatched();
    await new Promise((resolve) => { release = resolve; });
    return fakeReply();
  });
  const first = app.align();
  await began;
  const second = await app.align();
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, 'budget_exhausted');
  release();
  assert.equal((await first).status, 200);
  assert.equal((await app.status()).liveCalls, 1);
});

test('only two model calls can be in flight', async (t) => {
  const releases = [];
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const app = await start(t, enabled(), async () => {
    await new Promise((resolve) => { releases.push(resolve); if (releases.length === 2) started(); });
    return fakeReply();
  });
  const first = app.align();
  const second = app.align();
  await began;
  const third = await app.align();
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error, 'concurrency_limit');
  for (const release of releases) release();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
});

test('public binding requires a long access token and inference verifies it', async (t) => {
  assert.throws(() => loadConfig({ GUIDEPATCH_HOST: '0.0.0.0' }), /access_token/);
  assert.throws(() => loadConfig({ GUIDEPATCH_PUBLIC_ORIGIN: 'https://example.test' }), /access_token/);
  assert.throws(() => loadConfig({ GUIDEPATCH_BUDGET_USD: '5.01' }), /budget/);
  assert.throws(() => loadConfig({ NEBIUS_MODEL: 'unreviewed-model' }), /unsupported_model/);
  const token = 'test-only-reviewer-token-123456789';
  const app = await start(t, enabled({ accessToken: token }));
  assert.equal((await app.align()).status, 401);
  assert.equal((await app.align(input, { 'X-Guidepatch-Token': token })).status, 200);
  assert.equal((await app.status()).liveCalls, 1);
});

test('persistent ledger retains unknown reservations across restart and isolates phases', () => {
  const databasePath = fileURLToPath(new URL(`../data/test-ledgers/${randomUUID()}.sqlite`, import.meta.url));
  const first = createBudget(databasePath, 1, 'development');
  first.reserve('known', 'test-model', 20_000);
  first.dispatch('known');
  first.finish('known', 'succeeded', 10, { prompt_tokens: 100, completion_tokens: 50 }, 18);
  first.reserve('timeout', 'test-model', 30_000);
  first.dispatch('timeout');
  first.finish('timeout', 'provider_timeout', 60_000);
  first.close();
  const restarted = createBudget(databasePath, 1, 'development');
  assert.equal(restarted.status().remainingUsd, 0.969982);
  assert.equal(restarted.status().spentUsd, 0.000018);
  assert.equal(restarted.status().reservedUsd, 0.03);
  assert.equal(restarted.status().liveCalls, 2);
  restarted.close();
  const judging = createBudget(databasePath, 0, 'judging');
  assert.equal(judging.status().remainingUsd, 0);
  assert.equal(judging.status().liveCalls, 0);
  assert.equal(judging.status().totalCommittedUsd, 0.030018);
  assert.throws(() => judging.reserve('judging', 'test-model', 1), /budget_exhausted/);
  judging.close();
});

test('provider 500 keeps reservation and never returns provider diagnostics', async (t) => {
  const app = await start(t, enabled(), async () => new Response('private debug trace', { status: 500 }));
  const response = await app.align();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'provider_unavailable');
  assert.ok((await app.status()).reservedUsd > 0);
});

test('per-IP rate limit bounds sequential calls', async (t) => {
  const app = await start(t);
  for (let i = 0; i < 10; i += 1) assert.equal((await app.align()).status, 200);
  const blocked = await app.align();
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, 'rate_limit');
  assert.equal((await app.status()).liveCalls, 10);
});

test('foreign origins and unsupported methods cannot trigger model calls', async (t) => {
  const app = await start(t);
  assert.equal((await app.align(input, { Origin: 'https://unrelated.example' })).status, 403);
  const invalidHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(`${app.base}/api/align`, { method: 'POST', headers: { Host: 'unrelated.example', 'Content-Type': 'application/json' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(JSON.stringify(input));
  });
  assert.equal(invalidHostStatus, 403);
  assert.equal((await fetch(`${app.base}/api/align`)).status, 404);
  assert.equal((await app.status()).liveCalls, 0);
});

test('static files use correct MIME, SPA fallback, and block decoded traversal', async (t) => {
  const app = await start(t, enabled({ webRoot: fileURLToPath(new URL('./fixtures', import.meta.url)) }));
  const index = await fetch(app.base);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.match(await index.text(), /fixture/);
  assert.equal((await fetch(`${app.base}/review/demo`)).status, 200);
  assert.equal((await fetch(`${app.base}/missing.js`)).status, 404);
  const script = await fetch(`${app.base}/fixture.js`);
  assert.match(script.headers.get('content-type'), /text\/javascript/);
  assert.equal((await fetch(`${app.base}/..%2f..%2fpackage.json`)).status, 403);
});
