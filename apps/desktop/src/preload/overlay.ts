import { contextBridge, ipcRenderer } from 'electron';

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

const api = {
  region: (): Promise<Region> => ipcRenderer.invoke('mimik:overlay:region'),
  state: (): Promise<string> => ipcRenderer.invoke('mimik:overlay:state'),
  setRegion: (region: Region): void => ipcRenderer.send('mimik:overlay:setRegion', region),
  command: (command: string): void => ipcRenderer.send('mimik:overlay:command', command),
  onUpdate: (handler: (state: string, region: Region) => void): void => {
    ipcRenderer.on('mimik:overlay:update', (_event, state: string, region: Region) => handler(state, region));
  },
};

contextBridge.exposeInMainWorld('mimikOverlay', api);

export type MimikOverlayApi = typeof api;
