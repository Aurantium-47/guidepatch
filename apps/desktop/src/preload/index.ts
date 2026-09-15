import { contextBridge, ipcRenderer } from 'electron';

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

const api = {
  version: (): Promise<string> => ipcRenderer.invoke('mimik:version'),
  capture: {
    region: (): Promise<Region> => ipcRenderer.invoke('mimik:capture:region'),
    edit: (): Promise<void> => ipcRenderer.invoke('mimik:capture:edit'),
    onCommand: (handler: (command: string, state: string, region: Region) => void): void => {
      ipcRenderer.on('mimik:capture:command', (_event, command: string, state: string, region: Region) =>
        handler(command, state, region),
      );
    },
  },
  openAtLogin: {
    get: (): Promise<boolean> => ipcRenderer.invoke('mimik:openAtLogin:get'),
    set: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('mimik:openAtLogin:set', enabled),
  },
};

contextBridge.exposeInMainWorld('mimik', api);

export type MimikDesktopApi = typeof api;
