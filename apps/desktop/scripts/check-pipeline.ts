import { join } from 'node:path';
import { app, BrowserWindow, nativeImage, screen } from 'electron';
import { ask } from '../src/main/ask';
import { DesktopRecorder } from '../src/main/capture/recorder';
import { clampToDisplays } from '../src/main/capture/region';
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

  const recorder = new DesktopRecorder(
    () => region,
    (fn) => fn(),
    (request) => ask(win.webContents, 'mimik:capture:step', { ...request, guideId }),
    syntheticDisplay,
  );
  const guideId = await ask<string>(win.webContents, 'mimik:capture:startGuide');

  await recorder.capture({ x: region.x + 120, y: region.y + 90 });
  await recorder.capture({ x: region.x + 400, y: region.y + 300 });
  const results = await ask<CheckResult[]>(win.webContents, 'mimik:check:verify', guideId, 60_000);

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
