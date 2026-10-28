# GuidePatch inference service

Node 24, native HTTP and SQLite; no npm runtime dependencies. This is the server-side boundary for the GuidePatch web companion. It sends reviewed **text steps only** to Nebius. Images and imported tutorial archives are not part of this API.

## Run

From the repository root:

```powershell
npm --prefix apps/server start
npm --prefix apps/server test
npm --prefix apps/server run check
```

Default address: `http://127.0.0.1:4318`. The service serves `apps/web/dist` after the web build. During development, proxy `/api` from Vite on port 4317 to port 4318. A missing web build does not prevent `/api/status` from working.

Copy the names in `.env.example` into your secure local environment. The start command does **not** load `.env` automatically. If a private local `.env` is used, run `node --env-file=.env src/server.mjs` from `apps/server`. Never commit it. There is no browser API-key field and no endpoint that returns the key.

Live inference stays disabled until all of these conditions hold:

- `NEBIUS_API_KEY` is present.
- `NEBIUS_FREE_CREDIT_CONFIRMED=true` has been set after checking actual applicable free balance, expiry and payment controls.
- `GUIDEPATCH_BUDGET_USD` is positive. It defaults to zero and this build rejects values above USD 5 per phase.
- `NEBIUS_CREDIT_EXPIRES_AT` is a verified ISO timestamp in the future. Calls stop five minutes before expiry, including after a restart. Missing/unknown expiry keeps inference disabled.
- `NEBIUS_CONFIRMED_FREE_USD` is the verified allowance assigned exclusively to this ledger/key. It defaults to zero. Across both phases, committed spend cannot exceed this amount minus `GUIDEPATCH_RESERVE_USD` (default $15). Unknown failures retain their reservation in this common cap too. Account activity outside this app must be excluded or deducted when setting the allowance.

These are application controls; they do not inspect the Nebius account or prove free-credit eligibility. No real model call has been made during this implementation. The account/provisioning blocker remains outside this service.

## API

`GET /api/status` is anonymous and returns:

```json
{
  "provider": "nebius",
  "configured": false,
  "enabled": false,
  "model": "nvidia/Nemotron-3_5-Lightning",
  "phase": "development",
  "budgetUsd": 0,
  "remainingUsd": 0,
  "spentUsd": 0,
  "reservedUsd": 0,
  "totalCommittedUsd": 0,
  "liveCalls": 0
}
```

`remainingUsd` is the remaining **application budget**, not a Nebius account balance. `spentUsd` is a list-price estimate based on returned token usage; `reservedUsd` is the conservative amount held where the provider's usage is unknown. `totalCommittedUsd` includes both phases. `lastError` is present when the latest request in the current phase failed.

`POST /api/align`, with `Content-Type: application/json`:

```json
{
  "oldSteps": [{"id":"old-1","index":0,"description":"Click Invite","action":"click","url":"https://example.test/team","label":"Invite"}],
  "newSteps": [{"id":"new-1","index":0,"description":"Click Add member","action":"click","url":"https://example.test/team","label":"Add member"}]
}
```

Each guide has at most 80 steps; descriptions at most 1600 characters; whole request at most 200 KiB. One guide may be empty, but not both. IDs must be unique within each guide. Unknown fields, including `inputValue`, are not forwarded. URL credentials, query strings and fragments are removed. Common email addresses and credential patterns are masked, but this is not comprehensive anonymization; the web app must show the outbound text for review.

A successful response has `source: "nebius"`, `model`, `usage`, `estimatedCostUsd`, `requestId`, and `alignments`. Each alignment contains `oldId`, `newId`, `kind`, `reason`, `description`, and `uncertainty`. IDs must cover each original/new step exactly once. Kinds are `unchanged`, `changed`, `moved`, `added`, `removed`; additions have `oldId: null`, removals have `newId: null`. Invalid JSON or references are rejected, never converted into a fake successful result. Semantic quality still requires human review.

Error response: `{ "error": "short_code", "requestId": "..." }`; `requestId` is only present after a provider attempt was reserved. Typical codes are `live_inference_disabled` (503), `access_token_required` (401), `budget_exhausted` or `concurrency_limit` or `rate_limit` (429), `provider_timeout` (504), and provider/schema errors (502). Raw upstream diagnostics and secrets are never sent to the client.

## Provider and cost behavior

The endpoint is fixed to `https://api.tokenfactory.nebius.com/v1/chat/completions`. The allowlisted IDs/prices per million input/output tokens are Lightning `nvidia/Nemotron-3_5-Lightning` at $0.06/$0.24, and Super `nvidia/nemotron-3-super-120b-a12b` at $0.30/$0.90. These are public list-price assumptions, not the user's actual invoice. `NEBIUS_MODEL` selects one of these exact IDs.

The request uses JSON-object mode, then performs independent reference and schema validation. JSON-object support and model quality still need a real Nebius integration check. Maximum completion length is 4096 tokens, timeout is 60 seconds, and there are no automatic retries. An incomplete response fails rather than silently dropping steps.

Before dispatch, a SQLite `BEGIN IMMEDIATE` transaction reserves the prompt's UTF-8 byte count plus a framing allowance as a conservative token bound, and all 4096 completion tokens. Requests whose estimate exceeds $0.10 fail before dispatch. Known returned usage replaces the reservation with the list-price estimate, including malformed model output with valid usage. Timeout, network failure and provider errors without usage retain the full reservation because the actual billing is unknown. No API automatically clears these reservations.

## Persistence and judging

The default ledger is `apps/server/data/usage.sqlite`, ignored by Git. The CLI rejects `:memory:`; in-memory databases are only injected by tests. On a deployment, set `GUIDEPATCH_DB_PATH` to a durable volume. Recreating an ephemeral container without its ledger would lose application spending history and is not a supported judging deployment.

`GUIDEPATCH_PHASE` is either `development` (default) or `judging`. Reservations and usage are separate within the **same persistent ledger**, and each phase's past spend survives restarts. Set the current phase's cumulative cap with `GUIDEPATCH_BUDGET_USD`. Switching phases does not erase development records. Judging is not automatically enabled or funded: re-check actual free balance and expiry, review a separate judging allocation, then configure it. The current $5 cap is a bounded application allowance, not a claim that $5 covers the entire judging period. Any larger judging allowance requires a reviewed code/configuration change. Keep combined phase allocations within confirmed remaining free credits.

Only request ID, timestamp, phase, model ID, reserved/estimated cost, token counts, duration and a short status are stored. Prompts, step text, IP addresses and API keys are not persisted.

## Public deployment

Local binding is the default. A non-local public origin must use HTTPS. External binding, or a non-local `GUIDEPATCH_PUBLIC_ORIGIN`, requires `GUIDEPATCH_ACCESS_TOKEN` of at least 24 characters. Send it in `X-Guidepatch-Token`; it is a reviewer access secret, **not** the Nebius API key. Set `GUIDEPATCH_PUBLIC_ORIGIN` to the exact HTTPS origin so the host/origin allowlist accepts the deployment. Put TLS at the hosting proxy. Do not expose a local configuration through a tunnel without these controls.

Provider calls are capped at two in flight, ten attempts per IP per minute and thirty total per minute. Rate limits are per server process; deploy one instance. The persistent budget transaction remains atomic across database connections. Static files are confined to the web build directory; missing assets return 404 rather than the SPA page. The CSP permits local scripts/fonts and local/data/blob images, but not remotely loaded scripts.

## Verification scope

`npm test` runs 24 tests using injected mock provider responses plus real local HTTP requests. It covers disabled inference, input filtering/limits, unknown/duplicate/missing IDs, JSON failure, provider 429/500, timeout, reservation persistence after restart, phase isolation, concurrent budgets, two-call concurrency, per-IP limits, access control, origins, MIME and path containment. Mock responses are **not** evidence of Nebius access or model accuracy. The durable-ledger test leaves tiny ignored test databases under `data/test-ledgers/`; no cleanup deletes directories.

The test suite and syntax checks passed locally on Node 24.15.0. Real provider schema support, actual balance/payment behavior, real alignment quality, production hosting and judging access remain unverified.
