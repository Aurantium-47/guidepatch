import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true },
  });
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    process.stdout.write(`[console ${level}] ${message} (${source}:${line})\n`);
  });
  win.webContents.on('render-process-gone', (_e, d) => process.stdout.write(`[gone] ${d.reason}\n`));
  await win.loadFile(join(__dirname, '../renderer/index.html'));
  await new Promise((r) => setTimeout(r, 2500));
  const image = await win.webContents.capturePage();
  const out = process.env.SHOT_OUT ?? '/tmp/mimik-ui.png';
  writeFileSync(out, image.toPNG());
  process.stdout.write(`wrote ${out}\n`);
  app.exit(0);
}).catch((e) => { process.stdout.write(`FAIL ${e}\n`); app.exit(1); });
