import { contextBridge, ipcRenderer } from 'electron';
import type { CaptureSettings } from '../main/capture/settings';

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
    settings: {
      get: (): Promise<CaptureSettings> => ipcRenderer.invoke('mimik:capture:settings:get'),
      set: (patch: Partial<CaptureSettings>): Promise<CaptureSettings> =>
        ipcRenderer.invoke('mimik:capture:settings:set', patch),
    },
    onCommand: (handler: (command: string, state: string, region: Region) => void): void => {
      ipcRenderer.on('mimik:capture:command', (_event, command: string, state: string, region: Region) =>
        handler(command, state, region),
      );
    },
  },
  onRequest: (channel: string, handler: (payload: unknown) => Promise<unknown>): void => {
    ipcRenderer.on(channel, async (_event, replyChannel: string, payload: unknown) => {
      try {
        ipcRenderer.send(replyChannel, await handler(payload));
      } catch (error) {
        ipcRenderer.send(replyChannel, { error: error instanceof Error ? error.message : String(error) });
      }
    });
  },
  openAtLogin: {
    get: (): Promise<boolean> => ipcRenderer.invoke('mimik:openAtLogin:get'),
    set: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('mimik:openAtLogin:set', enabled),
  },
};

contextBridge.exposeInMainWorld('mimik', api);

export type MimikDesktopApi = typeof api;
