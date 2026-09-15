export type CursorStyle = 'arrow' | 'hand' | 'dot';

export interface CursorMark {
  x: number;
  y: number;
  style: CursorStyle;
  scale: number;
}

const ARROW: [number, number][] = [
  [0, 0],
  [0, 16.8],
  [4.2, 12.9],
  [7.1, 19.6],
  [9.9, 18.3],
  [7.1, 11.9],
  [12.6, 11.9],
];

const HAND: [number, number][] = [
  [6, 0],
  [8.4, 0],
  [8.4, 8.6],
  [9.8, 8.6],
  [9.8, 10.4],
  [12.2, 10.4],
  [12.2, 11.9],
  [14.6, 11.9],
  [14.6, 19.4],
  [12.2, 22],
  [6.6, 22],
  [3.4, 17.8],
  [1.4, 13.6],
  [3.4, 12.4],
  [6, 14.6],
];

function traceOutline(ctx: OffscreenCanvasRenderingContext2D, points: [number, number][], size: number): void {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const px = (x / 20) * size;
    const py = (y / 20) * size;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawCursor(ctx: OffscreenCanvasRenderingContext2D, mark: CursorMark): void {
  const size = 22 * mark.scale;

  ctx.save();
  ctx.translate(mark.x * mark.scale, mark.y * mark.scale);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, size / 16);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = size / 6;
  ctx.shadowOffsetY = size / 20;

  if (mark.style === 'dot') {
    ctx.fillStyle = 'rgba(79, 70, 229, 0.32)';
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1e1b4b';
    traceOutline(ctx, mark.style === 'hand' ? HAND : ARROW, size);
  }

  ctx.restore();
}

export async function withCursor(png: Uint8Array, width: number, height: number, mark: CursorMark): Promise<Blob> {
  const source = await createImageBitmap(new Blob([Uint8Array.from(png)], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    source.close();
    return new Blob([Uint8Array.from(png)], { type: 'image/png' });
  }

  ctx.drawImage(source, 0, 0);
  source.close();
  drawCursor(ctx, mark);
  return canvas.convertToBlob({ type: 'image/png' });
}
