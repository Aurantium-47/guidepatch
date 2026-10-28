import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { loadConfig } from './config.mjs';
import { prepareInput } from './input.mjs';
import { validateAlignments } from './alignment.mjs';
import { createBudget } from './budget.mjs';
import { requestAlignment } from './provider.mjs';

export function createApp({ config = loadConfig(), fetchImpl = fetch } = {}) {
  const budget = createBudget(config.databasePath, config.budgetUsd, config.phase, config.sharedAllowanceUsd);
  const attempts = [];
  const byIp = new Map();
  let active = 0;
  const creditCurrent = () => Number.isFinite(config.creditExpiresAt) && Date.now() + 300_000 < config.creditExpiresAt;
  const publicHost = config.publicOrigin ? new URL(config.publicOrigin).host : '';
  const knownOrigins = new Set([
    'http://localhost:4317', 'http://127.0.0.1:4317',
    `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`,
    `http://[::1]:${config.port}`,
    ...(config.publicOrigin ? [config.publicOrigin] : []),
  ]);
  const json = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  const readBody = (req) => new Promise((resolveBody, reject) => {
    let size = 0;
    let failed = false;
    const parts = [];
    req.on('data', (part) => {
      if (failed) return;
      size += part.length;
      if (size > 200 * 1024) {
        failed = true;
        parts.length = 0;
        reject(new Error('body_too_large'));
      } else parts.push(part);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolveBody(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', () => reject(new Error('request_interrupted')));
  });
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    const host = req.headers.host || '';
    const port = server.address()?.port ?? config.port;
    if (![`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, publicHost].filter(Boolean).includes(host)) {
      json(res, 403, { error: 'host_not_allowed' });
      return;
    }
    const origin = req.headers.origin;
    if (origin && !knownOrigins.has(origin) && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`].includes(origin)) {
      json(res, 403, { error: 'origin_not_allowed' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Guidepatch-Token', 'Access-Control-Max-Age': '600' });
      res.end();
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { json(res, 400, { error: 'invalid_path' }); return; }
    if (pathname === '/api/status' && req.method === 'GET') {
      const current = budget.status();
      json(res, 200, {
        provider: 'nebius',
        configured: Boolean(config.apiKey),
        enabled: Boolean(config.apiKey && config.freeCreditConfirmed && creditCurrent() && current.remainingUsd > 0),
        creditExpiresAt: Number.isFinite(config.creditExpiresAt) ? new Date(config.creditExpiresAt).toISOString() : null,
        model: config.model,
        ...current,
      });
      return;
    }
    if (pathname === '/api/align' && req.method === 'POST') {
      if (config.accessToken) {
        const supplied = req.headers['x-guidepatch-token'];
        const expectedBytes = Buffer.from(config.accessToken);
        const suppliedBytes = Buffer.from(typeof supplied === 'string' ? supplied : '');
        if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
          json(res, 401, { error: 'access_token_required' });
          return;
        }
      }
      if (!config.apiKey || !config.freeCreditConfirmed || !creditCurrent() || config.budgetUsd <= 0) {
        json(res, 503, { error: 'live_inference_disabled' });
        return;
      }
      if (active >= 2) { json(res, 429, { error: 'concurrency_limit' }); return; }
      const now = Date.now();
      while (attempts.length && attempts[0] < now - 60_000) attempts.shift();
      for (const [address, stamps] of byIp) if (!stamps.some((stamp) => stamp >= now - 60_000)) byIp.delete(address);
      const ip = req.socket.remoteAddress || 'unknown';
      const ipAttempts = (byIp.get(ip) || []).filter((stamp) => stamp >= now - 60_000);
      if (attempts.length >= 30 || ipAttempts.length >= 10) { json(res, 429, { error: 'rate_limit' }); return; }
      attempts.push(now);
      ipAttempts.push(now);
      byIp.set(ip, ipAttempts);
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { json(res, 415, { error: 'json_required' }); return; }
      if (Number(req.headers['content-length']) > 200 * 1024) { json(res, 413, { error: 'body_too_large' }); return; }
      let input;
      try { input = prepareInput(await readBody(req)); }
      catch (error) { json(res, error.message === 'body_too_large' ? 413 : 400, { error: error.message }); return; }
      if (active >= 2) { json(res, 429, { error: 'concurrency_limit' }); return; }
      if (!creditCurrent()) { json(res, 503, { error: 'free_credit_expired' }); return; }
      const planned = requestAlignment(config, input, fetchImpl);
      if (planned.reservedMicros > config.maxRequestUsd * 1_000_000) { json(res, 413, { error: 'request_cost_limit' }); return; }
      const requestId = randomUUID();
      try { budget.reserve(requestId, config.model, planned.reservedMicros); }
      catch { json(res, 429, { error: 'budget_exhausted' }); return; }
      active += 1;
      const started = Date.now();
      let usage;
      try {
        budget.dispatch(requestId);
        const result = await planned.execute();
        usage = result.usage;
        const alignments = validateAlignments(result.data, input);
        const micros = Math.ceil(usage.prompt_tokens * config.prices.input + usage.completion_tokens * config.prices.output);
        budget.finish(requestId, 'succeeded', Date.now() - started, usage, micros);
        json(res, 200, { source: 'nebius', model: config.model, usage, estimatedCostUsd: micros / 1_000_000, alignments, requestId });
      } catch (error) {
        const safeCodes = new Set(['provider_timeout', 'provider_network_error', 'provider_rate_limited', 'provider_auth_failed', 'provider_unavailable', 'provider_invalid_response', 'provider_usage_missing', 'provider_invalid_json', 'provider_output_incomplete', 'invalid_model_alignment', 'model_step_reference_invalid', 'model_alignment_kind_mismatch', 'model_step_coverage_incomplete']);
        const code = safeCodes.has(error.message) ? error.message : 'internal_error';
        usage ||= error.usage;
        const micros = usage ? Math.ceil(usage.prompt_tokens * config.prices.input + usage.completion_tokens * config.prices.output) : undefined;
        budget.finish(requestId, code, Date.now() - started, usage, micros);
        json(res, code === 'provider_timeout' ? 504 : code === 'provider_rate_limited' ? 429 : 502, { error: code, requestId });
      } finally { active -= 1; }
      return;
    }
    if (pathname.startsWith('/api/')) { json(res, 404, { error: 'not_found' }); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: 'method_not_allowed' }); return; }
    const requested = resolve(config.webRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rel = relative(config.webRoot, requested);
    if (rel.startsWith('..') || isAbsolute(rel) || pathname.includes('\0')) { json(res, 403, { error: 'path_not_allowed' }); return; }
    let file = requested;
    let contents;
    try { contents = await readFile(file); }
    catch {
      if (extname(pathname)) { json(res, 404, { error: 'not_found' }); return; }
      file = resolve(config.webRoot, 'index.html');
      try { contents = await readFile(file); }
      catch { json(res, 404, { error: 'web_build_not_found' }); return; }
    }
    const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mimik': 'application/zip', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': mimes[extname(file)] || 'application/octet-stream', 'Content-Length': contents.length, 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return {
    server,
    close: () => new Promise((resolveClose, reject) => server.close((error) => {
      budget.close();
      if (error) reject(error); else resolveClose();
    })),
  };
}
