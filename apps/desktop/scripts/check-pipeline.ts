import { join } from 'node:path';
import { app, BrowserWindow, nativeImage, screen } from 'electron';
import { ask } from '../src/main/ask';
import { DesktopRecorder, shouldCapture } from '../src/main/capture/recorder';
import { clampToDisplays } from '../src/main/capture/region';
import { DEFAULT_CAPTURE_SETTINGS, loadSettings, normaliseSettings, saveSettings } from '../src/main/capture/settings';
import type { Capture } from '../src/main/capture/screenshot';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function bail(error: unknown): never {
  process.stdout.write(`FAIL check-pipeline aborted: ${error instanceof Error ? error.stack : String(error)}\n`);
  app.exit(1);
  throw error;
}

setTimeout(() => bail(new Error('check did not finish within 120s')), 120_000).unref();

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true },
  });
  await win.loadFile(join(__dirname, '../renderer/check-pipeline.html'));
  const region = clampToDisplays({ x: 0, y: 0, width: 800, height: 600 });
  const display = screen.getDisplayMatching(region);

  function syntheticDisplay(displayId: number): Promise<Capture> {
    const scale = display.scaleFactor;
    const width = Math.round(display.bounds.width * scale);
    const height = Math.round(display.bounds.height * scale);
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i / 4) % 256;
      pixels[i + 1] = 80;
      pixels[i + 2] = 200;
      pixels[i + 3] = 255;
    }
    const image = nativeImage.createFromBuffer(pixels, { width, height });
    return Promise.resolve({ png: image.toPNG(), width, height, scaleFactor: scale, displayId });
  }

  let settings = { ...DEFAULT_CAPTURE_SETTINGS, showCursor: false };
  let activeGuide = '';
  const recorder = new DesktopRecorder(
    () => region,
    (fn) => fn(),
    (request) => ask(win.webContents, 'mimik:capture:step', { ...request, guideId: activeGuide }),
    syntheticDisplay,
    () => settings,
  );

  activeGuide = await ask<string>(win.webContents, 'mimik:capture:startGuide');
  const guideId = activeGuide;

  await recorder.capture({ x: region.x + 120, y: region.y + 90 });
  await recorder.capture({ x: region.x + 400, y: region.y + 300 });
  const results = await ask<CheckResult[]>(win.webContents, 'mimik:check:verify', guideId, 60_000);

  const userSettings = loadSettings();
  const clamped = normaliseSettings({ screenshotDelayMs: 5000, cursorStyle: 'wobble' as never });
  const stored = saveSettings({ screenshotDelayMs: 750, captureOutsideClicks: true });
  const reloaded = loadSettings();
  results.push({
    name: 'settings clamp and persist',
    ok:
      clamped.screenshotDelayMs === 2000 &&
      clamped.cursorStyle === DEFAULT_CAPTURE_SETTINGS.cursorStyle &&
      reloaded.screenshotDelayMs === 750 &&
      reloaded.captureOutsideClicks === stored.captureOutsideClicks,
    detail: `5000 ms clamped to ${clamped.screenshotDelayMs}, unknown style fell back to ${clamped.cursorStyle}, 750 ms reloaded as ${reloaded.screenshotDelayMs}`,
  });
  saveSettings(userSettings);

  const outsidePoint = { x: region.x + region.width + 40, y: region.y + 20 };
  results.push({
    name: 'outside clicks are opt in',
    ok:
      !shouldCapture({ ...DEFAULT_CAPTURE_SETTINGS, captureOutsideClicks: false }, region, outsidePoint) &&
      shouldCapture({ ...DEFAULT_CAPTURE_SETTINGS, captureOutsideClicks: true }, region, outsidePoint) &&
      shouldCapture({ ...DEFAULT_CAPTURE_SETTINGS, captureOutsideClicks: false }, region, {
        x: region.x + 10,
        y: region.y + 10,
      }),
    detail: 'ignored when off, captured when on, inside always captured',
  });

  activeGuide = await ask<string>(win.webContents, 'mimik:capture:startGuide');

  settings = { ...DEFAULT_CAPTURE_SETTINGS, screenshotDelayMs: 400, showCursor: false };
  const before = Date.now();
  await recorder.capture({ x: region.x + 10, y: region.y + 10 });
  const elapsed = Date.now() - before;
  results.push({
    name: 'screenshot delay is honoured',
    ok: elapsed >= 400,
    detail: `${elapsed} ms for a 400 ms delay`,
  });

  settings = { ...DEFAULT_CAPTURE_SETTINGS, showCursor: true, cursorStyle: 'arrow', screenshotDelayMs: 0 };
  await recorder.capture({ x: region.x + 200, y: region.y + 150 });
  const cursorSizes = await ask<number[]>(win.webContents, 'mimik:check:blobSizes', activeGuide, 30_000);
  results.push({
    name: 'cursor is drawn into the frame',
    ok: cursorSizes.length >= 2 && cursorSizes[cursorSizes.length - 1] !== cursorSizes[0],
    detail: `${cursorSizes[0]} bytes without a cursor, ${cursorSizes[cursorSizes.length - 1]} bytes with one`,
  });

  await ask(win.webContents, 'mimik:check:cleanup', [guideId, activeGuide], 30_000);

  process.stdout.write(
    `capture area ${region.width} × ${region.height} on a ${display.bounds.width} × ${display.bounds.height} display at ${display.scaleFactor}x\n\n`,
  );
  for (const result of results) {
    process.stdout.write(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name.padEnd(36)} ${result.detail}\n`);
  }

  const failures = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n${failures === 0 ? 'desktop captures are ordinary guides' : `${failures} failure(s)`}\n`);
  app.exit(failures === 0 ? 0 : 1);
}).catch(bail);
