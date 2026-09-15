import './core-env';
import { PRESET_LABELS } from '@mimik/core/blur/regexes';
import type { CaptureStepData } from '@mimik/core/capture/sink';
import { getGuides } from '@mimik/core/guides/service';
import type { CaptureSettings } from '../main/capture/settings';
import { DesktopCaptureSink } from './capture-sink';
import './style.css';

const sink = new DesktopCaptureSink();
window.mimik.onRequest('mimik:capture:startGuide', () => sink.startGuide());
window.mimik.onRequest('mimik:capture:step', (payload) => sink.captureStep(payload as CaptureStepData));

const root = document.getElementById('root') as HTMLElement;

async function render(): Promise<void> {
  const [version, atLogin, region, settings] = await Promise.all([
    window.mimik.version(),
    window.mimik.openAtLogin.get(),
    window.mimik.capture.region(),
    window.mimik.capture.settings.get(),
  ]);
  root.replaceChildren();

  const title = document.createElement('h1');
  title.textContent = 'Mimik Desktop';

  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `Version ${version}`;

  const label = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = atLogin;
  toggle.addEventListener('change', async () => {
    toggle.checked = await window.mimik.openAtLogin.set(toggle.checked);
  });
  label.append(toggle, document.createTextNode('Start Mimik when I log in'));

  const shared = document.createElement('p');
  shared.className = 'meta';
  shared.textContent = `Smart Blur categories from @mimik/core: ${Object.values(PRESET_LABELS).join(', ')}`;

  const area = document.createElement('p');
  area.className = 'meta';
  area.textContent = `Capture area ${region.width} × ${region.height} at ${region.x}, ${region.y}`;

  const edit = document.createElement('button');
  edit.textContent = 'Set capture area';
  edit.addEventListener('click', () => window.mimik.capture.edit());

  const library = document.createElement('p');
  library.className = 'meta';
  const refresh = async () => {
    const guides = await getGuides();
    library.textContent = `${guides.length} guide(s) in the library`;
  };
  await refresh();

  window.mimik.capture.onCommand((_command, _state, next) => {
    area.textContent = `Capture area ${next.width} × ${next.height} at ${next.x}, ${next.y}`;
    void refresh();
  });

  const capturing = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Capturing';
  capturing.append(legend);

  let current: CaptureSettings = settings;
  const save = async (patch: Partial<CaptureSettings>) => {
    current = await window.mimik.capture.settings.set(patch);
    style.disabled = !current.showCursor;
  };

  const cursorRow = document.createElement('label');
  const cursorToggle = document.createElement('input');
  cursorToggle.type = 'checkbox';
  cursorToggle.checked = current.showCursor;
  cursorToggle.addEventListener('change', () => save({ showCursor: cursorToggle.checked }));
  cursorRow.append(cursorToggle, document.createTextNode('Show the cursor in screenshots'));

  const styleRow = document.createElement('label');
  const style = document.createElement('select');
  for (const option of ['arrow', 'hand', 'dot'] as const) {
    const node = document.createElement('option');
    node.value = option;
    node.textContent = option;
    node.selected = current.cursorStyle === option;
    style.append(node);
  }
  style.disabled = !current.showCursor;
  style.addEventListener('change', () => save({ cursorStyle: style.value as CaptureSettings['cursorStyle'] }));
  styleRow.append(document.createTextNode('Pointer style'), style);

  const delayRow = document.createElement('label');
  const delay = document.createElement('input');
  delay.type = 'number';
  delay.min = '0';
  delay.max = '2000';
  delay.step = '50';
  delay.value = String(current.screenshotDelayMs);
  delay.addEventListener('change', async () => {
    await save({ screenshotDelayMs: Number(delay.value) });
    delay.value = String(current.screenshotDelayMs);
  });
  delayRow.append(document.createTextNode('Screenshot delay (ms)'), delay);

  const outsideRow = document.createElement('label');
  const outside = document.createElement('input');
  outside.type = 'checkbox';
  outside.checked = current.captureOutsideClicks;
  outside.addEventListener('change', () => save({ captureOutsideClicks: outside.checked }));
  outsideRow.append(outside, document.createTextNode('Capture clicks outside the capture area'));

  capturing.append(cursorRow, styleRow, delayRow, outsideRow);

  root.append(title, meta, label, area, edit, capturing, library, shared);
}

render();
