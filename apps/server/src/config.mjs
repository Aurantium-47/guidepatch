import { fileURLToPath } from 'node:url';

export function loadConfig(env = process.env) {
  const models = {
    'nvidia/Nemotron-3_5-Lightning': { input: 0.06, output: 0.24 },
    'nvidia/nemotron-3-super-120b-a12b': { input: 0.30, output: 0.90 },
  };
  const model = env.NEBIUS_MODEL || 'nvidia/Nemotron-3_5-Lightning';
  const budgetUsd = Number(env.GUIDEPATCH_BUDGET_USD || 0);
  const port = Number(env.GUIDEPATCH_PORT || 4318);
  const host = env.GUIDEPATCH_HOST || '127.0.0.1';
  const accessToken = env.GUIDEPATCH_ACCESS_TOKEN || '';
  const phase = env.GUIDEPATCH_PHASE || 'development';
  const confirmedFreeUsd = Number(env.NEBIUS_CONFIRMED_FREE_USD || 0);
  const reserveUsd = Number(env.GUIDEPATCH_RESERVE_USD || 15);
  if (!models[model]) throw new Error('unsupported_model');
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0 || budgetUsd > 5) throw new Error('budget_must_be_between_0_and_5_usd');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid_port');
  if (!['development', 'judging'].includes(phase)) throw new Error('invalid_phase');
  if (!Number.isFinite(confirmedFreeUsd) || confirmedFreeUsd < 0 || !Number.isFinite(reserveUsd) || reserveUsd < 0) throw new Error('invalid_free_credit_allowance');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && accessToken.length < 24) throw new Error('external_binding_requires_access_token_24_characters');
  const publicOrigin = env.GUIDEPATCH_PUBLIC_ORIGIN || '';
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== publicOrigin) throw new Error('invalid_public_origin');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) && parsed.protocol !== 'https:') throw new Error('public_origin_requires_https');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) && accessToken.length < 24) throw new Error('public_origin_requires_access_token_24_characters');
  }
  return {
    host,
    port,
    accessToken,
    publicOrigin,
    phase,
    apiKey: env.NEBIUS_API_KEY || '',
    freeCreditConfirmed: env.NEBIUS_FREE_CREDIT_CONFIRMED === 'true',
    creditExpiresAt: Date.parse(env.NEBIUS_CREDIT_EXPIRES_AT || ''),
    sharedAllowanceUsd: Math.max(0, confirmedFreeUsd - reserveUsd),
    model,
    prices: models[model],
    budgetUsd,
    maxTokens: 4096,
    timeoutMs: 60_000,
    maxRequestUsd: 0.10,
    databasePath: env.GUIDEPATCH_DB_PATH || fileURLToPath(new URL('../data/usage.sqlite', import.meta.url)),
    webRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
  };
}
