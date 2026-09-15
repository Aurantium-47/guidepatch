import './core-env';
import { PRESET_LABELS } from '@mimik/core/blur/regexes';
import type { CaptureStepData } from '@mimik/core/capture/sink';
import { getGuides } from '@mimik/core/guides/service';
import { DesktopCaptureSink } from './capture-sink';
import './style.css';

const sink = new DesktopCaptureSink();
window.mimik.onRequest('mimik:capture:startGuide', () => sink.startGuide());
window.mimik.onRequest('mimik:capture:step', (payload) => sink.captureStep(payload as CaptureStepData));

const root = document.getElementById('root') as HTMLElement;

async function render(): Promise<void> {
  const [version, atLogin, region] = await Promise.all([
    window.mimik.version(),
    window.mimik.openAtLogin.get(),
    window.mimik.capture.region(),
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

  root.append(title, meta, label, area, edit, library, shared);
}

render();
