import './overlay.css';

interface LastStep {
  index: number;
  title: string;
}

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN = { width: 240, height: 160 };
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

const [role, originX, originY] = window.location.hash.slice(1).split(':');
const origin = { x: Number(originX) || 0, y: Number(originY) || 0 };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function normalise(a: { x: number; y: number }, b: { x: number; y: number }): Region {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(Math.abs(a.x - b.x), MIN.width),
    height: Math.max(Math.abs(a.y - b.y), MIN.height),
  };
}

function editor(): void {
  document.body.className = 'editor';

  const size = el('div', { id: 'size' });
  const region = el('div', { id: 'region', className: 'empty' }, size);
  for (const handle of HANDLES) {
    const node = el('div', { className: 'handle' });
    node.dataset.handle = handle;
    region.append(node);
  }

  const hint = el(
    'div',
    { id: 'hint' },
    'Drag to set the capture area — ',
    el('b', {}, 'Enter'),
    ' to confirm, ',
    el('b', {}, 'Esc'),
    ' to cancel',
  );
  document.body.append(region, hint);

  let rect: Region | null = null;

  function paint(): void {
    if (!rect) {
      region.className = 'empty';
      return;
    }
    const local = { left: rect.x - origin.x, top: rect.y - origin.y };
    const onScreen =
      local.left + rect.width > 0 &&
      local.top + rect.height > 0 &&
      local.left < window.innerWidth &&
      local.top < window.innerHeight;
    region.className = onScreen ? '' : 'empty';
    region.style.left = `${local.left}px`;
    region.style.top = `${local.top}px`;
    region.style.width = `${rect.width}px`;
    region.style.height = `${rect.height}px`;
    size.textContent = `${rect.width} × ${rect.height}`;
  }

  function commit(next: Region): void {
    rect = next;
    paint();
    window.mimikOverlay.setRegion(next);
  }

  document.body.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as Handle | undefined;
    const moving = !handle && region.contains(target) && rect !== null;
    const start = { x: event.clientX + origin.x, y: event.clientY + origin.y };
    const from = rect ? { ...rect } : null;

    document.body.setPointerCapture(event.pointerId);
    event.preventDefault();

    const move = (e: PointerEvent) => {
      const point = { x: e.clientX + origin.x, y: e.clientY + origin.y };
      if (handle && from) {
        const left = handle.includes('w') ? point.x : from.x;
        const top = handle.includes('n') ? point.y : from.y;
        const right = handle.includes('e') ? point.x : from.x + from.width;
        const bottom = handle.includes('s') ? point.y : from.y + from.height;
        commit(normalise({ x: left, y: top }, { x: right, y: bottom }));
      } else if (moving && from) {
        commit({ ...from, x: from.x + (point.x - start.x), y: from.y + (point.y - start.y) });
      } else {
        commit(normalise(start, point));
      }
    };

    const up = () => {
      document.body.removeEventListener('pointermove', move);
      document.body.removeEventListener('pointerup', up);
    };

    document.body.addEventListener('pointermove', move);
    document.body.addEventListener('pointerup', up);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') window.mimikOverlay.command('arm');
    if (event.key === 'Escape') window.mimikOverlay.command('cancel');
  });

  window.mimikOverlay.region().then((current) => {
    rect = current;
    paint();
  });
  window.mimikOverlay.onUpdate((_state, current) => {
    rect = current;
    paint();
  });
}

function boundary(): void {
  document.body.className = 'boundary';
  document.body.append(el('div', { id: 'frame' }));
  const apply = (state: string) => document.body.setAttribute('data-state', state);
  window.mimikOverlay.state().then(apply);
  window.mimikOverlay.onUpdate(apply);
}

function controls(): void {
  document.body.className = 'controls';
  const dot = el('div', { id: 'dot' });
  const label = el('span', {}, 'Ready');
  const counter = el('span', { id: 'counter' });
  const status = el('div', { id: 'status' }, dot, label, counter);
  const step = el('div', { id: 'step' });
  document.body.append(step);
  const primary = el('button', { className: 'primary' });
  const secondary = el('button', {});
  const close = el('button', {}, 'Stop');
  document.body.append(status, secondary, primary, close);

  const render = (state: string, _region?: Region, last?: LastStep | null) => {
    document.body.setAttribute('data-state', state);
    if (last) {
      counter.textContent = `#${last.index}`;
      step.textContent = last.title;
      step.hidden = false;
    } else {
      counter.textContent = '';
      step.hidden = true;
    }
    label.textContent = state === 'recording' ? 'Recording' : state === 'paused' ? 'Paused' : 'Ready';
    primary.textContent = state === 'recording' ? 'Pause' : state === 'paused' ? 'Resume' : 'Start';
    primary.dataset.command = state === 'recording' ? 'pause' : state === 'paused' ? 'resume' : 'start';
    secondary.textContent = 'Capture area';
    secondary.hidden = state === 'recording';
    close.textContent = state === 'armed' ? 'Close' : 'Stop';
    close.dataset.command = state === 'armed' ? 'cancel' : 'stop';
  };

  primary.addEventListener('click', () => window.mimikOverlay.command(primary.dataset.command ?? 'start'));
  secondary.addEventListener('click', () => window.mimikOverlay.command('edit'));
  close.addEventListener('click', () => window.mimikOverlay.command(close.dataset.command ?? 'stop'));

  Promise.all([window.mimikOverlay.state(), window.mimikOverlay.last()]).then(([state, last]) =>
    render(state, undefined, last),
  );
  window.mimikOverlay.onUpdate(render);
}

if (role === 'editor') editor();
else if (role === 'boundary') boundary();
else controls();
