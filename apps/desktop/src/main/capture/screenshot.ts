import { desktopCapturer, screen } from 'electron';

export interface Capture {
  png: Buffer;
  width: number;
  height: number;
  scaleFactor: number;
  displayId: number;
}

export async function captureDisplay(displayId: number): Promise<Capture> {
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) throw new Error(`no display with id ${displayId}`);

  const { width, height } = display.size;
  const scaleFactor = display.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) },
    fetchWindowIcons: false,
  });

  const source = sources.find((s) => s.display_id === String(displayId)) ?? sources[0];
  if (!source) throw new Error('no screen sources available');
  if (source.thumbnail.isEmpty()) throw new Error('screen capture returned an empty frame');

  const size = source.thumbnail.getSize();
  return { png: source.thumbnail.toPNG(), width: size.width, height: size.height, scaleFactor, displayId };
}

export async function captureCursorDisplay(): Promise<Capture> {
  const point = screen.getCursorScreenPoint();
  return captureDisplay(screen.getDisplayNearestPoint(point).id);
}
