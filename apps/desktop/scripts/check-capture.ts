import { app } from 'electron';
import { captureCursorDisplay, cursorPoint, focusedWindow, InputHook, listDisplays } from '../src/main/capture';

type Verdict = 'ok' | 'fail' | 'n/a';

function line(name: string, verdict: Verdict, detail: string): void {
  const tag = verdict === 'ok' ? 'ok  ' : verdict === 'n/a' ? 'n/a ' : 'FAIL';
  process.stdout.write(`${tag} ${name.padEnd(18)} ${detail}\n`);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  let failures = 0;

  const displays = listDisplays();
  const displaysOk = displays.length > 0 && displays.every((d) => d.scaleFactor > 0 && d.bounds.width > 0);
  if (!displaysOk) failures++;
  line('displays', displaysOk ? 'ok' : 'fail', displays.map((d) => `${d.bounds.width}x${d.bounds.height}@${d.scaleFactor}x`).join(', '));

  const point = cursorPoint();
  line('cursor', Number.isFinite(point.x) ? 'ok' : 'fail', `${point.x},${point.y}`);

  try {
    const shot = await captureCursorDisplay();
    const ok = shot.png.length > 0 && shot.width > 0;
    if (!ok) failures++;
    line('screenshot', ok ? 'ok' : 'fail', `${shot.width}x${shot.height}, ${(shot.png.length / 1024).toFixed(0)} KB png`);
  } catch (error) {
    failures++;
    line('screenshot', 'fail', error instanceof Error ? error.message : String(error));
  }

  const win = await focusedWindow();
  if (!win.ok && win.reason !== 'unsupported-session') failures++;
  line(
    'focused window',
    win.ok ? 'ok' : win.reason === 'unsupported-session' ? 'n/a' : 'fail',
    win.ok ? `${win.window.app.name} — ${win.window.title ?? '(untitled)'}` : `${win.reason}: ${win.detail}`,
  );

  const hook = new InputHook();
  const started = await hook.start(() => {});
  if (!started.ok && started.reason !== 'unsupported-session') failures++;
  line(
    'input hook',
    started.ok ? 'ok' : started.reason === 'unsupported-session' ? 'n/a' : 'fail',
    started.ok ? 'started' : `${started.reason}: ${started.detail}`,
  );
  hook.stop();

  process.stdout.write(
    `\n${failures === 0 ? 'no failures — n/a lines are platform limits, not bugs' : `${failures} failure(s)`}\n`,
  );
  app.exit(failures === 0 ? 0 : 1);
});
