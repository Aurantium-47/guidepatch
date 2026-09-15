import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { CaptureOverlay, type OverlayCommand } from './overlay';
import { checkForUpdates } from './updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlay: CaptureOverlay | null = null;

function resource(file: string): string {
  return app.isPackaged ? join(process.resourcesPath, file) : join(__dirname, '../../resources', file);
}

function opensAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

function setOpenAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: enabled });
  refreshTrayMenu();
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#EEF2FF',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!app.getLoginItemSettings().wasOpenedAsHidden) mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Mimik', click: () => showWindow() },
      { label: 'Set capture area', click: () => overlay?.edit() },
      { type: 'separator' },
      {
        label: 'Start at login',
        type: 'checkbox',
        checked: opensAtLogin(),
        click: (item) => setOpenAtLogin(item.checked),
      },
      { label: 'Check for updates', click: () => checkForUpdates({ notifyWhenUpToDate: true }) },
      { type: 'separator' },
      { label: 'Quit Mimik', click: () => quit() },
    ]),
  );
}

function createTray(): void {
  const icon = nativeImage.createFromPath(resource('icon32.png'));
  tray = new Tray(process.platform === 'darwin' ? icon.resize({ width: 16, height: 16 }) : icon);
  tray.setToolTip('Mimik');
  tray.on('click', () => showWindow());
  refreshTrayMenu();
}

function broadcastOverlay(command: OverlayCommand): void {
  mainWindow?.webContents.send('mimik:capture:command', command, overlay?.state, overlay?.region);
}

let isQuitting = false;

function quit(): void {
  isQuitting = true;
  app.quit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    ipcMain.handle('mimik:openAtLogin:get', () => opensAtLogin());
    ipcMain.handle('mimik:openAtLogin:set', (_event, enabled: boolean) => {
      setOpenAtLogin(Boolean(enabled));
      return opensAtLogin();
    });
    ipcMain.handle('mimik:version', () => app.getVersion());

    overlay = new CaptureOverlay(broadcastOverlay);
    ipcMain.handle('mimik:capture:region', () => overlay?.region);
    ipcMain.handle('mimik:capture:edit', () => overlay?.edit());

    createWindow();
    createTray();
    checkForUpdates({ notifyWhenUpToDate: false });
  });

  app.on('activate', () => showWindow());
  app.on('before-quit', () => {
    isQuitting = true;
    overlay?.destroy();
  });
  app.on('window-all-closed', () => {});
}
