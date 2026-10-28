# Tool feedback evidence

2026-10-28. This is an evidence ledger for a future feedback submission, not a completed API-performance report.

## Observed workflow

- The official event promo form returned “Form submitted” and said the code would be emailed, as recorded by the coordinating chat. This is an application receipt, not a credited balance.
- The coordinating chat encountered a Cloudflare login-verification loop in Edge. It performed a normal refresh and recorded the continuing limitation. This is an observed onboarding obstacle; its root cause is not established.
- Public model metadata and official documentation provided the planned model ID, OpenAI-compatible endpoint and list-price inputs needed to implement an adapter.

## Implemented but not yet measured live

The service requests JSON-object output from Nemotron, validates every source ID exactly once, sets a completion cap, uses no automatic retries, and records latency/usage estimates without prompts or keys. Mock timeout/429/malformed-output cases test failure behavior only; they are not reported as actual Nebius defects.

No real provider request, response-quality benchmark, latency percentile or actual charged amount has yet been measured. Once a free-credit-backed call is available, attach its model ID, request ID, token usage, duration, validation outcome and public-rate estimate. Then compare with the account's actual usage view, keeping any billing differences explicit.

## Feedback questions to investigate

1. Does the selected Nemotron route reliably return complete step references under JSON-object mode for the small 5–12-step task?
2. How are reasoning/output token usage and any truncated completion represented?
3. Can new builders clearly distinguish promo application, receipt, redemption, credited balance and expiration in onboarding?

These are investigation questions. Do not present them as discovered model/service bugs before a real reproduction exists.
