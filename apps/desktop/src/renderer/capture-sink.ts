import type {
  CaptureSink,
  CaptureStepData,
  CaptureStepResponse,
  FinalizeInputStepData,
  FinalizeInputStepResponse,
  UpdateInputStepData,
  UpdateInputStepResponse,
} from '@mimik/core/capture/sink';
import { buildFallbackDescription } from '@mimik/core/capture/step-description';
import { localStorage } from '@mimik/core/env';
import {
  addStepToGuide,
  createGuide,
  createStep,
  getStepsForGuide,
  saveScreenshot,
  updateStepDescription,
} from '@mimik/core/guides/service';
import type { Screenshot } from '@mimik/core/guides/types';
import { DEFAULT_TARGET_COLOR } from '@mimik/core/screenshot/types';
import { type CursorMark, withCursor } from './cursor';

export type DesktopCaptureStepData = CaptureStepData & { cursor?: CursorMark };

export class DesktopCaptureSink implements CaptureSink {
  async startGuide(): Promise<string> {
    const guide = await createGuide(crypto.randomUUID());
    return guide.id;
  }

  async captureStep(data: DesktopCaptureStepData): Promise<CaptureStepResponse & { title?: string }> {
    const stepId = crypto.randomUUID();
    const meta = data.elementMeta;
    const index = (await getStepsForGuide(data.guideId)).length;

    let screenshotId: string | undefined;
    if (data.image) {
      const { targetColor } = await localStorage.get(['targetColor']);
      const ratio = meta.devicePixelRatio;
      const screenshot: Screenshot = {
        id: crypto.randomUUID(),
        stepId,
        blob: data.cursor
          ? await withCursor(data.image.png, data.image.width, data.image.height, data.cursor)
          : new Blob([Uint8Array.from(data.image.png)], { type: 'image/png' }),
        mimeType: 'image/png',
        width: data.image.width,
        height: data.image.height,
        bounds: { x: meta.rect.x, y: meta.rect.y, width: meta.rect.width, height: meta.rect.height },
        pixelRatio: ratio,
        clickPoint: meta.clickPoint,
        edits: {
          target: {
            x: meta.rect.x * ratio,
            y: meta.rect.y * ratio,
            width: meta.rect.width * ratio,
            height: meta.rect.height * ratio,
            border: 'dashed',
            color: targetColor || DEFAULT_TARGET_COLOR,
          },
        },
      };
      await saveScreenshot(screenshot);
      screenshotId = screenshot.id;
    }

    const description = buildFallbackDescription(data.action, meta);

    await createStep({
      id: stepId,
      guideId: data.guideId,
      index,
      description,
      action: data.action,
      url: '',
      app: meta.app,
      window: meta.window,
      timestamp: Date.now(),
      screenshotId,
      elementMeta: meta,
      descriptionSource: 'heuristic',
    });
    await addStepToGuide(data.guideId, stepId);

    return { stepId, title: description };
  }

  async updateInputStep(data: UpdateInputStepData): Promise<UpdateInputStepResponse> {
    await updateStepDescription(data.stepId, data.description);
    return { updated: true };
  }

  async finalizeInputStep(_data: FinalizeInputStepData): Promise<FinalizeInputStepResponse> {
    return { updated: false };
  }
}
