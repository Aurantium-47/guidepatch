import { join } from 'node:path';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { clampToDisplays, loadRegion, type Region, saveRegion } from '../capture/region';

export type OverlayState = 'hidden' | 'editing' | 'armed' | 'recording' | 'paused';
export type OverlayCommand = 'edit' | 'arm' | 'cancel' | 'start' | 'pause' | 'resume' | 'stop';

const BORDER = 3;
const CONTROLS = { width: 268, height: 48, gap: 12 };

function rendererFile(): string {
  return join(__dirname, '../renderer/overlay.html');
}

function preloadFile(): string {
  return join(__dirname, '../preload/overlay.cjs');
}

function overlayWindow(bounds: Electron.Rectangle, hash: string, interactive: boolean): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: interactive,
    acceptFirstMouse: true,
    webPreferences: { preload: preloadFile(), contextIsolation: true, nodeIntegration: false },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);
  if (!interactive) win.setIgnoreMouseEvents(true);
  const load = process.env.ELECTRON_RENDERER_URL
    ? win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html#${hash}`)
    : win.loadFile(rendererFile(), { hash });
  load.catch((error) => {
    process.stderr.write(`overlay window ${hash} failed to load: ${error}\n`);
  });
  return win;
}

export class CaptureOverlay {
  private editors: BrowserWindow[] = [];
  private boundary: BrowserWindow | null = null;
  private controls: BrowserWindow | null = null;
  private current: OverlayState = 'hidden';
  private rect: Region;

  constructor(private onCommand: (command: OverlayCommand) => void) {
    this.rect = loadRegion();
    ipcMain.handle('mimik:overlay:region', () => this.rect);
    ipcMain.handle('mimik:overlay:state', () => this.current);
    ipcMain.on('mimik:overlay:setRegion', (_event, next: Region) => this.setRegion(next));
    ipcMain.on('mimik:overlay:command', (_event, command: OverlayCommand) => this.command(command));
  }

  get region(): Region {
    return this.rect;
  }

  get state(): OverlayState {
    return this.current;
  }

  private windows(): BrowserWindow[] {
    return [...this.editors, this.boundary, this.controls].filter(
      (w): w is BrowserWindow => w !== null && !w.isDestroyed(),
    );
  }

  private broadcast(): void {
    for (const win of this.windows()) win.webContents.send('mimik:overlay:update', this.current, this.rect);
  }

  private setRegion(next: Region): void {
    this.rect = saveRegion(next);
    if (this.boundary && !this.boundary.isDestroyed()) this.boundary.setBounds(this.frameBounds());
    this.positionControls();
    this.broadcast();
  }

  private frameBounds(): Electron.Rectangle {
    return {
      x: this.rect.x - BORDER,
      y: this.rect.y - BORDER,
      width: this.rect.width + BORDER * 2,
      height: this.rect.height + BORDER * 2,
    };
  }

  private positionControls(): void {
    if (!this.controls || this.controls.isDestroyed()) return;
    const { workArea } = screen.getDisplayMatching(this.rect);
    const below = this.rect.y + this.rect.height + CONTROLS.gap;
    const fits = below + CONTROLS.height <= workArea.y + workArea.height;
    this.controls.setBounds({
      x: Math.round(
        Math.min(
          Math.max(this.rect.x + (this.rect.width - CONTROLS.width) / 2, workArea.x),
          workArea.x + workArea.width - CONTROLS.width,
        ),
      ),
      y: Math.round(fits ? below : Math.max(this.rect.y - CONTROLS.height - CONTROLS.gap, workArea.y)),
      width: CONTROLS.width,
      height: CONTROLS.height,
    });
  }

  private closeEditors(): void {
    for (const win of this.editors) if (!win.isDestroyed()) win.destroy();
    this.editors = [];
  }

  private ensureBoundary(): void {
    if (this.boundary && !this.boundary.isDestroyed()) return;
    this.boundary = overlayWindow(this.frameBounds(), 'boundary', false);
  }

  private ensureControls(): void {
    if (this.controls?.isDestroyed()) this.controls = null;
    if (!this.controls) {
      this.controls = overlayWindow({ x: 0, y: 0, ...CONTROLS }, 'controls', true);
      this.controls.setIgnoreMouseEvents(false);
    }
    this.positionControls();
  }

  edit(): void {
    this.current = 'editing';
    if (this.boundary && !this.boundary.isDestroyed()) this.boundary.hide();
    if (this.controls && !this.controls.isDestroyed()) this.controls.hide();
    this.closeEditors();

    this.editors = screen.getAllDisplays().map((display) => {
      const win = overlayWindow(display.bounds, `editor:${display.bounds.x}:${display.bounds.y}`, true);
      win.setIgnoreMouseEvents(false);
      win.once('ready-to-show', () => win.show());
      return win;
    });
  }

  private show(state: Exclude<OverlayState, 'hidden' | 'editing'>): void {
    this.closeEditors();
    this.current = state;
    this.ensureBoundary();
    this.ensureControls();
    for (const win of this.windows()) win.showInactive();
    this.broadcast();
  }

  arm(): void {
    this.show('armed');
  }

  record(): void {
    this.show('recording');
  }

  pause(): void {
    this.show('paused');
  }

  hide(): void {
    this.current = 'hidden';
    this.closeEditors();
    for (const win of this.windows()) win.hide();
  }

  private command(command: OverlayCommand): void {
    if (command === 'edit') this.edit();
    else if (command === 'arm') this.arm();
    else if (command === 'start' || command === 'resume') this.record();
    else if (command === 'pause') this.pause();
    else this.hide();
    this.onCommand(command);
  }

  async withHidden<T>(fn: () => Promise<T>): Promise<T> {
    const shown = this.windows().filter((win) => win.isVisible());
    for (const win of shown) win.hide();
    try {
      return await fn();
    } finally {
      for (const win of shown) if (!win.isDestroyed()) win.showInactive();
    }
  }

  destroy(): void {
    this.closeEditors();
    for (const win of [this.boundary, this.controls]) if (win && !win.isDestroyed()) win.destroy();
    this.boundary = null;
    this.controls = null;
    this.current = 'hidden';
    for (const channel of ['mimik:overlay:region', 'mimik:overlay:state']) ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners('mimik:overlay:setRegion');
    ipcMain.removeAllListeners('mimik:overlay:command');
  }
}

export { clampToDisplays, loadRegion, type Region, saveRegion };
