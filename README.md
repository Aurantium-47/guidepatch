# GuidePatch

**Keep the work in your guides. Update the steps that changed.**

GuidePatch maintains browser workflow guides that already contain edited explanations, warnings and chapters worth keeping. Import two independently recorded `.mimik` files, inspect old/new screenshots, correct their correspondence, review the changes, and export a maintained tutorial.

## Implemented workflow

- Normal web workspace; reviewers do not need to install an extension.
- Mimik v1 bundle import with bounded input and duplicate/missing-reference checks.
- Unique exact-text matches with screenshot changes kept visible for human review.
- Manual matching/unlinking, accept/keep decisions, editable wording, original/latest ordering and explicit note anchors.
- Old manual/narrated wording stays by default when a newer action/screenshot is adopted; old/new/custom wording can be selected.
- Undo and automatic session recovery in the same browser.
- Preview navigation/focusing, self-contained HTML walkthrough, editable Mimik export and JSON audit record.
- Server-only Nebius/NVIDIA adapter with validated references, persistent cost reservations, a common free-credit allowance, expiry cutoff and access controls.

**Live status:** the adapter is implemented and mock-tested. No real Nebius call has yet been verified. Local review works independently; hackathon runtime compliance remains pending.

## Quick start

Node.js 24+ and pnpm are required. Tested with Node 24.15.0 and pnpm 11.25.0.

```sh
pnpm install --filter @guidepatch/web... --ignore-scripts
pnpm --filter @guidepatch/web build
npm --prefix apps/server start
```

Open **http://127.0.0.1:4318/**. Choose **Try the invitation workflow** or import your own pair. The sample uses an owned application, synthetic names and real browser screenshots; its archives are script-assembled using the v1 schema, not presented as extension capture.

For development, run the server plus `pnpm --filter @guidepatch/web dev`; Vite uses 4317 and proxies `/api` to 4318.

## Record and review

Use [Mimik](https://github.com/westpoint-io/mimik) to record old/new workflows and export editable `.mimik` files. Optional upstream AI/voice features are separately billed and are not required by GuidePatch.

1. Import both versions and confirm their titles.
2. Correct unmatched/renamed steps manually, or request live semantic alignment when enabled.
3. Inspect the screenshots and wording. Clicking Save is not proof of success.
4. Keep useful explanations and review note anchors when changing the step order.
5. Resolve every pending decision, then export. Original files are not overwritten.

## Real Nebius alignment

Only the server reads the provider key. Copy `apps/server/.env.example` to private `apps/server/.env` after checking actual applicable free credits, amount and expiry. These files and the ledger are ignored by Git.

```sh
cd apps/server
node --env-file=.env src/server.mjs
```

Defaults authorize **zero spending**. Enable only after setting the key, explicit free-credit confirmation, known amount/expiry and reviewed budget. The optional web reviewer code is not a model API key.

The planned model is `nvidia/Nemotron-3_5-Lightning` through `https://api.tokenfactory.nebius.com/v1/chat/completions`; Super is allowlisted too. Nemotron proposes semantic correspondence and wording from step text/action/labels/page paths. Screenshots stay local. IDs, shape and coverage are checked; semantic correctness remains a human judgment.

The outbound-text preview appears before sending. Input values and URL queries are excluded; the server masks common email/credential patterns. Descriptions and paths can still contain private information, so this is not comprehensive anonymization.

See [server configuration](apps/server/README.md). Application cost estimates are not account balances or invoices. Keep an exclusive allowance, known expiry, margin and persistent ledger.

## Test

```sh
pnpm --filter @guidepatch/web typecheck
pnpm --filter @guidepatch/web test
npm --prefix apps/server test
pnpm --filter @guidepatch/web test:e2e --workers=1
```

New tests cover ambiguous repeated steps, invalid references, manual wording, moved chapters/notes, screenshot-change preservation, review/undo/reload, archive round trips, escaped HTML and budget/provider failures. One browser worker is used; artifacts have unique paths.

Earlier browser runs actually opened the downloaded HTML and exercised Previous/Next in a clean page. After a separate review tool refused local-file execution, later checks inspect the export and exercise the ordinary HTTP preview instead of retrying the refused operation. The review limitation is recorded.

The inherited Mimik suite passed 1,964 tests during baseline verification. These are upstream tests, not new GuidePatch tests. See [validation evidence](submission/validation.md).

## Deployment

The Node service serves the web build and API. Use one instance and a durable SQLite volume. Public configuration requires an exact HTTPS origin and a reviewer code of at least 24 characters; local HTTP is supported. TLS can terminate at a reverse proxy.

Docker/Compose files are provided but have not been built or deployed in this environment. The named ledger volume must survive container replacement. Configure keys through private runtime secrets, never build arguments/client assets. A development allocation is not automatically a funded judging allocation.

## Upstream and contribution

This repository begins at [Mimik extension v1.4.1](https://github.com/westpoint-io/mimik/tree/v1.4.1), commit `0de93847e51c5610378d3498c5ecfbef4047d07f`, MIT. The inherited recorder, guide types, screenshot renderer/redaction, bundle parser and static exporters belong to Westpoint/Mimik. Its README is preserved in [UPSTREAM_README.md](UPSTREAM_README.md).

GuidePatch adds `apps/web` and `apps/server`: cross-recording semantic update review, retained editorial content and note anchors, an independent walkthrough/control layer, provenance records, and bounded server-side Nebius integration. Shared upstream packages and the recorder are preserved.

Existing Mimik AI rewriting, version history and insertion of recordings are not claimed as new inventions. The contribution is reviewing updates between independent recordings and carrying approved results into actual deliverables.

See [notices](THIRD_PARTY_NOTICES.md) and [MIT license](LICENSE). Model licenses are separate; weights are not distributed.

## Limits

- Bundle v1 only, at most 80 steps/30 MB per input; these are safety bounds, not measured model quality claims.
- One-to-one mapping; splits/merges remain unmatched for human judgment.
- Bundles do not contain complete after-state or full DOM history; recorded actions alone do not establish success.
- Session recovery is in the same browser. JSON is an audit log, not a portable project backup; keep both source files.
- Arbitrary website execution, desktop recording and automated software repair are outside this companion.
- Real model quality/cost/latency, public hosting and final submission remain pending until evidenced.
