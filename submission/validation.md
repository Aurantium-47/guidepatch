# Validation record

2026-10-28. Inherited baseline, new local behavior, mocks, and unverified live integration are separate.

| Evidence | Result | Boundary |
|---|---|---|
| Upstream extension typecheck/build | Passed; Chrome output 4.50 MB | Original Mimik capabilities |
| Upstream baseline suite | 155 files / 1,964 tests passed with bounded workers | Not GuidePatch-authored tests |
| GuidePatch domain suite | 15 tests passed | Includes unchanged-but-pending manual-pair export refusal |
| GuidePatch server suite | 24 tests passed | Mock provider and real local HTTP/SQLite; no Nebius calls |
| Web production build/typecheck | Passed | Not a model or deployment result |
| Browser review/export/restore run | 5 tests passed before the later file-execution restriction | Both export formats, retained note/wording, recovery/failure and mobile layout |
| Final browser regression | 6 passed | Strict import, manual pair, preserved editorial assets, Mimik reimport, HTML content inspection, original HTTP preview, failed analysis/recovery, malicious-looking text and mobile layout |
| Independent HTML in that run | Previous/Next worked in a separate file page; images and 7 action steps | Later review automation refused local-file execution; subsequent checks do not retry that refusal |
| Editable bundle export | Upstream parser reopened it in a clean context; 8 steps / 7 screenshots | Sample archives were assembled by script using the v1 schema |
| Extension load | Unpacked v1.4.1 loaded in an isolated Edge profile | Actual capture/export check still in progress |
| Real Nebius/NVIDIA inference | **Not verified; zero calls** | Account, credits and key required |
| Public hosting/judging access | **Not verified** | Docker files are configuration, not deployment evidence |

Fixed synthetic cases include repeated Continue/Save, renamed buttons, role confirmation, invalid IDs, manually edited wording, moved chapter groups and screenshot-only changes. These are test cases, not user adoption or accuracy benchmarks.

The sample application is owned and uses synthetic users. Twelve frames were captured from Edge; none were image-generated. Archive assembly is labelled separately from actual recorder output.

Known gaps: real model quality/latency/cost, actual JSON mode/reasoning behavior, final live demonstration, production persistence, and final submission.
