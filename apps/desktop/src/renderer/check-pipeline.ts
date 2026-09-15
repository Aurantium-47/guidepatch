import './core-env';
import type { CaptureStepData } from '@mimik/core/capture/sink';
import { exportGuideAsDOCX } from '@mimik/core/export/docx-export';
import { exportGuideAsHTML } from '@mimik/core/export/html-export';
import { exportGuideAsMarkdown } from '@mimik/core/export/markdown-export';
import { exportGuideAsPDF } from '@mimik/core/export/pdf-export';
import { getGuide, permanentlyDeleteGuide } from '@mimik/core/guides/service';
import { elementSource } from '@mimik/core/guides/types';
import { DesktopCaptureSink } from './capture-sink';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const sink = new DesktopCaptureSink();

window.mimik.onRequest('mimik:capture:startGuide', () => sink.startGuide());
window.mimik.onRequest('mimik:capture:step', (payload) => sink.captureStep(payload as CaptureStepData));

window.mimik.onRequest('mimik:check:verify', async (payload) => {
  const guideId = payload as string;
  const results: CheckResult[] = [];
  const found = await getGuide(guideId);

  if (!found) {
    return [{ name: 'guide in the library', ok: false, detail: 'guide not found' }];
  }

  const { guide, steps, screenshots } = found;
  const step = steps[0];
  const meta = step?.elementMeta;
  const shot = step ? screenshots.get(step.id) : undefined;

  results.push({
    name: 'steps land in the library',
    ok: steps.length === 2 && guide.stepIds.length === 2,
    detail: `${steps.length} step(s), ${guide.stepIds.length} id(s) on the guide`,
  });

  results.push({
    name: 'step carries screen provenance',
    ok: meta !== undefined && elementSource(meta) === 'screen',
    detail: meta
      ? `source ${elementSource(meta)}, app "${step.app?.name ?? 'none'}", window "${step.window?.title ?? 'none'}"`
      : 'no element metadata',
  });

  results.push({
    name: 'screenshot cropped to the region',
    ok: shot !== undefined && shot.blob.size > 0,
    detail: shot ? `${shot.width} × ${shot.height}, ${shot.blob.size} bytes` : 'no screenshot',
  });

  results.push({
    name: 'description came from the shared heuristic',
    ok: (step?.description.length ?? 0) > 0 && step?.descriptionSource === 'heuristic',
    detail: `"${step?.description ?? ''}"`,
  });

  const exporters: [string, () => Promise<string | Blob>][] = [
    ['HTML', () => exportGuideAsHTML(guide, steps, screenshots)],
    ['Markdown', () => exportGuideAsMarkdown(guide, steps, screenshots)],
    ['PDF', () => exportGuideAsPDF(guide, steps, screenshots)],
    ['DOCX', () => exportGuideAsDOCX(guide, steps, screenshots)],
  ];

  for (const [name, run] of exporters) {
    try {
      const output = await run();
      const size = typeof output === 'string' ? output.length : output.size;
      results.push({ name: `${name} export`, ok: size > 0, detail: `${size} bytes` });
    } catch (error) {
      results.push({
        name: `${name} export`,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await permanentlyDeleteGuide(guideId);
  return results;
});
