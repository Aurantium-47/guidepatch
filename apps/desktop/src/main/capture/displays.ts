import { screen } from 'electron';

export interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  rotation: number;
  primary: boolean;
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    rotation: d.rotation,
    primary: d.id === primaryId,
  }));
}

export function displayAt(point: { x: number; y: number }): DisplayInfo | null {
  const match = screen.getDisplayNearestPoint(point);
  return listDisplays().find((d) => d.id === match.id) ?? null;
}

export function cursorPoint(): { x: number; y: number } {
  return screen.getCursorScreenPoint();
}
