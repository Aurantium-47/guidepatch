import { contextBridge, ipcRenderer } from 'electron';

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LastStep {
  index: number;
  title: string;
}

const api = {
  region: (): Promise<Region> => ipcRenderer.invoke('mimik:overlay:region'),
  state: (): Promise<string> => ipcRenderer.invoke('mimik:overlay:state'),
  last: (): Promise<LastStep> => ipcRenderer.invoke('mimik:overlay:last'),
  setRegion: (region: Region): void => ipcRenderer.send('mimik:overlay:setRegion', region),
  command: (command: string): void => ipcRenderer.send('mimik:overlay:command', command),
  onUpdate: (handler: (state: string, region: Region, last: LastStep | null) => void): void => {
    ipcRenderer.on('mimik:overlay:update', (_event, state: string, region: Region, last: LastStep | null) =>
      handler(state, region, last),
    );
  },
};

contextBridge.exposeInMainWorld('mimikOverlay', api);

export type MimikOverlayApi = typeof api;
