import './core-env';
import { PRESET_LABELS } from '@mimik/core/blur/regexes';
import './style.css';

declare global {
  interface Window {
    mimik: {
      version(): Promise<string>;
      openAtLogin: { get(): Promise<boolean>; set(enabled: boolean): Promise<boolean> };
      capture: {
        region(): Promise<{ x: number; y: number; width: number; height: number }>;
        edit(): Promise<void>;
        onCommand(
          handler: (
            command: string,
            state: string,
            region: { x: number; y: number; width: number; height: number },
          ) => void,
        ): void;
      };
    };
  }
}

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

  window.mimik.capture.onCommand((_command, _state, next) => {
    area.textContent = `Capture area ${next.width} × ${next.height} at ${next.x}, ${next.y}`;
  });

  root.append(title, meta, label, area, edit, shared);
}

render();
