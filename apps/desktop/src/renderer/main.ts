import { PRESET_LABELS } from '@mimik/core/blur/regexes';
import './style.css';

declare global {
  interface Window {
    mimik: {
      version(): Promise<string>;
      openAtLogin: { get(): Promise<boolean>; set(enabled: boolean): Promise<boolean> };
    };
  }
}

const root = document.getElementById('root') as HTMLElement;

async function render(): Promise<void> {
  const [version, atLogin] = await Promise.all([window.mimik.version(), window.mimik.openAtLogin.get()]);
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

  root.append(title, meta, label, shared);
}

render();
