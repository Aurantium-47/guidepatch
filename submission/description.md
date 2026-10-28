# GuidePatch — keep your guides in step

Status: editable submission draft. Offline product behavior is locally tested; real Nebius inference, public judging access and submission are not yet verified. This status must be updated only from actual evidence before publishing.

## Inspiration

An established tutorial contains more than clicks. Someone has added explanations, workspace warnings and a structure that makes the process useful. Recording the new interface from scratch can discard that work. GuidePatch helps maintain it.

Public user discussions describe both the effort of assembling screenshot guides and the difficulty keeping them current as processes change. These are problem signals, not validation of our product or a market-size claim.

## What it does

The author opens an existing Mimik guide and a fresh recording of the same task. GuidePatch displays both sides, identifies exact matches and screenshot changes, and lets a reviewer pair renamed steps or unlink a wrong suggestion. Old edited wording is preserved by default; actions and screenshots can be updated while useful explanations are kept or revised. Chapters and warnings can be anchored to the relevant action.

Every pending item needs a decision. The result becomes an actual editable Mimik guide, a self-contained HTML walkthrough, and a review record. Undo and same-browser recovery preserve the working session.

## How it is built

The project begins at Mimik extension v1.4.1 under MIT. It reuses the upstream capture workflow, guide types, screenshot renderer/redaction, bundle parser and exporters. Our contribution is the independent web companion, cross-recording correspondence and review, retained editorial assets, note anchors, standalone controls and bounded server-side model integration.

The implemented live path calls NVIDIA Nemotron through Nebius Token Factory to propose semantic correspondence between recorded steps. It accepts text metadata rather than screenshots. The server validates references, complete coverage and response shape, and keeps credentials out of the browser. At this draft's date, that path has only been tested with an injected mock provider; it has not yet produced a verified real model result.

## What we learned

Matching text does not mean matching evidence. A screenshot may have changed even when its caption has not. Re-pairing two steps must not clear unrelated review decisions. Preserving a warning's words also is not enough if it moves into the wrong chapter. These findings produced specific regression cases and changes to the review model.

## Honest limits

The product handles Mimik bundle v1 and one-to-one mappings. Splits, merges and uncertain relationships require review. A recorded click does not prove success, and available bundles lack a complete after-state history. Local exact matches and mock test outputs are labelled separately from live model output.

Track proposed: Best Apps and Agents, subject to completing the mandatory runtime and access evidence.

## 中文说明

GuidePatch面向已经有人工说明、注意事项和章节结构的软件教程。用户导入旧教程与新版录制，审核对应步骤、截图与文字，保留有价值的旧编辑成果，再导出可用的新教程。Mimik原有录制、截图处理及导出明确归功于上游；本项目增加跨独立录制的更新审核工作区与服务端Nebius接入。当前本地产品已测试，真实推理、公开访问和正式提交仍待核验。
