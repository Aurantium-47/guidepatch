import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

let wired = false;

export function checkForUpdates(opts: { notifyWhenUpToDate: boolean }): void {
  if (!app.isPackaged) return;

  if (!wired) {
    wired = true;
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', async (info) => {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Mimik ${info.version} is ready to install.`,
      });
      if (response === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', (err) => {
      if (opts.notifyWhenUpToDate) {
        dialog.showMessageBox({ type: 'error', title: 'Update check failed', message: String(err?.message ?? err) });
      }
    });
  }

  autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (opts.notifyWhenUpToDate && !result?.updateInfo) {
        dialog.showMessageBox({ type: 'info', title: 'Up to date', message: `Mimik ${app.getVersion()} is current.` });
      }
    })
    .catch(() => {});
}
