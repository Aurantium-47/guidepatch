import type { CaptureImage } from '@mimik/core/capture/sink';
import type { ElementMeta } from '@mimik/core/guides/types';
import { nativeImage, screen } from 'electron';
import { focusedWindow } from './focused-window';
import { type InputAction, InputHook } from './input-hook';
import type { Region } from './region';
import { type Capture, captureDisplay } from './screenshot';

const TARGET_SIZE = 28;
const SETTLE_MS = 60;

export interface CaptureRequest {
  action: string;
  elementMeta: ElementMeta;
  image: CaptureImage;
}

export type RecorderStart = { ok: true } | { ok: false; reason: string; detail: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inside(region: Region, point: { x: number; y: number }): boolean {
  return (
    point.x >= region.x &&
    point.y >= region.y &&
    point.x < region.x + region.width &&
    point.y < region.y + region.height
  );
}

export class DesktopRecorder {
  private hook = new InputHook();
  private queue: Promise<unknown> = Promise.resolve();
  private paused = false;
  private running = false;

  constructor(
    private readonly region: () => Region,
    private readonly withHidden: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly send: (request: CaptureRequest) => Promise<unknown>,
    private readonly grab: (displayId: number) => Promise<Capture> = captureDisplay,
  ) {}

  async start(): Promise<RecorderStart> {
    if (this.running) return { ok: true };
    const started = await this.hook.start((action) => this.onAction(action));
    if (!started.ok) return { ok: false, reason: started.reason, detail: started.detail };
    this.running = true;
    this.paused = false;
    return { ok: true };
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.hook.stop();
    this.running = false;
    this.paused = false;
  }

  get isRecording(): boolean {
    return this.running && !this.paused;
  }

  private onAction(action: InputAction): void {
    if (action.kind !== 'click' || !this.isRecording) return;
    const point = { x: action.x, y: action.y };
    if (!inside(this.region(), point)) return;
    this.enqueue(point);
  }

  private enqueue(point: { x: number; y: number }): void {
    this.queue = this.queue.then(() => this.capture(point)).catch(() => undefined);
  }

  async capture(point: { x: number; y: number }): Promise<void> {
    const region = this.region();
    const display = screen.getDisplayMatching(region);
    const scale = display.scaleFactor;

    const shot = await this.withHidden(async () => {
      await delay(SETTLE_MS);
      return this.grab(display.id);
    });

    const cropped = nativeImage.createFromBuffer(Buffer.from(shot.png)).crop({
      x: Math.round((region.x - display.bounds.x) * scale),
      y: Math.round((region.y - display.bounds.y) * scale),
      width: Math.round(region.width * scale),
      height: Math.round(region.height * scale),
    });
    const size = cropped.getSize();

    const local = { x: point.x - region.x, y: point.y - region.y };
    const found = await focusedWindow();

    await this.send({
      action: 'click',
      elementMeta: {
        source: 'screen',
        textContent: null,
        ariaLabel: null,
        placeholder: null,
        altText: null,
        name: null,
        role: null,
        rect: {
          x: local.x - TARGET_SIZE / 2,
          y: local.y - TARGET_SIZE / 2,
          width: TARGET_SIZE,
          height: TARGET_SIZE,
        },
        devicePixelRatio: scale,
        clickPoint: local,
        ...(found.ok ? { app: found.window.app, window: { title: found.window.title } } : {}),
      },
      image: { png: cropped.toPNG(), width: size.width, height: size.height },
    });
  }

  async drain(): Promise<void> {
    await this.queue;
  }
}
