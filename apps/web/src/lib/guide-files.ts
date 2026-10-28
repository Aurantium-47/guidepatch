import { readBundle } from '@mimik/core/transfer/parse';
import { unzipSync, strFromU8 } from 'fflate';
import { exportGuideAsBundle } from '@mimik/core/transfer/bundle';
import { exportGuideAsHTML } from '@mimik/core/export/html-export';
import { DEFAULT_EXPORT_OPTIONS } from '@mimik/core/export/options';
import { renderScreenshot } from '@mimik/core/screenshot/render';
import type { Screenshot, Step } from '@mimik/core/guides/types';
import type { Alignment, ImportedGuide, Workspace } from '../domain';
import { buildReviewedGuide, noteAnchor } from './review';

export async function importGuide(file: File): Promise<ImportedGuide> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a guide smaller than 30 MB.');
  let declared: { steps?: unknown[]; screenshots?: unknown[] };
  try {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => entry.name === 'manifest.json' && entry.originalSize <= 2 * 1024 * 1024 });
    declared = JSON.parse(strFromU8(entries['manifest.json']));
  } catch { throw new Error('The guide manifest is missing, damaged or too large. Export a fresh Mimik file.'); }
  const { manifest: m, images } = await readBundle(file);
  if (m.version !== 1) throw new Error('GuidePatch supports Mimik bundle version 1.');
  if (m.steps.length > 80) throw new Error('Use a focused guide with at most 80 steps.');
  if (m.steps.length !== declared.steps?.length || m.screenshots.length !== (declared.screenshots?.length ?? 0)) throw new Error('Some guide entries are incomplete or unsupported. Export a fresh copy instead of losing steps.');
  const ids = new Set(m.steps.map(s => s.id));
  if (ids.size !== m.steps.length) throw new Error('This guide contains duplicate step IDs. Export a fresh copy.');
  const guideId = crypto.randomUUID();
  const screenshots = new Map<string, Screenshot>();
  const shotIds = new Set<string>();
  for (const shot of m.screenshots) {
    const blob = images.get(shot.file);
    if (!blob) throw new Error('A screenshot referenced by this guide is missing. Export a complete copy.');
    if (screenshots.has(shot.stepId) || shotIds.has(shot.id)) throw new Error('This guide has conflicting screenshot references.');
    shotIds.add(shot.id);
    const { file: _file, ...meta } = shot;
    screenshots.set(shot.stepId, { ...meta, blob });
  }
  const steps: Step[] = [...m.steps].sort((a, b) => a.index - b.index).map((s, index) => ({
    ...s, index, guideId, screenshotId: screenshots.get(s.id)?.id,
  }));
  return {
    guide: { id: guideId, title: m.guide.title, description: m.guide.description, createdAt: m.guide.createdAt, updatedAt: m.exportedAt, starred: false, deletedAt: null, stepIds: steps.map(s => s.id) },
    steps, screenshots, fileName: file.name,
  };
}

export async function screenshotUrl(shot?: Screenshot, focus = false): Promise<string | null> {
  if (!shot) return null;
  const blob = await renderScreenshot(shot, { ...(focus ? {} : { viewport: { x: 0, y: 0, width: shot.width, height: shot.height } }), target: true });
  return URL.createObjectURL(blob);
}

export async function withImageChanges(rows: Alignment[], original: ImportedGuide, updated: ImportedGuide): Promise<Alignment[]> {
  return Promise.all(rows.map(async row => {
    if (!row.oldId || !row.newId) return row;
    const a = original.screenshots.get(row.oldId), b = updated.screenshots.get(row.newId);
    let same = !a && !b;
    if (a && b && a.blob.size === b.blob.size && JSON.stringify(a.edits) === JSON.stringify(b.edits) && JSON.stringify(a.bounds) === JSON.stringify(b.bounds)) {
      const x = new Uint8Array(await a.blob.arrayBuffer()), y = new Uint8Array(await b.blob.arrayBuffer());
      same = x.length === y.length && x.every((v, i) => v === y[i]);
    }
    return same ? { ...row, imageChanged: false } : { ...row, imageChanged: true, kind: 'changed' as const, reason: row.kind === 'changed' ? row.reason : `${row.reason} Screenshot or framing differs; review the actual images.` };
  }));
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function exportReviewed(workspace: Workspace, kind: 'bundle' | 'html') {
  if (workspace.rows.some(r => r.decision === 'pending')) throw new Error('Review every change before exporting a final guide.');
  if (workspace.order === 'latest') {
    for (const row of workspace.rows) {
      const old = workspace.oldGuide.steps.find(s => s.id === row.oldId);
      if (!old?.blockType || row.newId || row.decision === 'accept') continue;
      const anchor = noteAnchor(row, workspace.oldGuide.steps);
      const target = workspace.rows.find(r => r.oldId === anchor.oldId);
      if (target?.decision === 'accept' && !target.newId) throw new Error('A kept note is attached to a removed action. Choose another note anchor before exporting.');
    }
  }
  const output = buildReviewedGuide(workspace);
  if (!output.steps.length) throw new Error('The reviewed guide has no steps. Keep at least one step.');
  const name = (output.guide.title.replace(/[^\p{L}\p{N}_ -]/gu, '').trim().slice(0, 70) || 'reviewed-guide');
  if (kind === 'bundle') {
    downloadBlob(await exportGuideAsBundle(output.guide, output.steps, output.screenshots), `${name}.mimik`);
  } else {
    const html = await exportGuideAsHTML(output.guide, output.steps, output.screenshots, { ...DEFAULT_EXPORT_OPTIONS, cover: false, imageScale: 'large' });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const controls = doc.createElement('nav');
    controls.setAttribute('aria-label', 'Walkthrough playback');
    controls.style.cssText = 'position:sticky;top:0;z-index:5;background:#1c2428;color:white;padding:14px 20px;display:flex;gap:14px;align-items:center;border-radius:12px;margin-bottom:24px;';
    controls.innerHTML = '<strong style="margin-right:auto">GuidePatch walkthrough</strong><button id="gp-prev">Previous</button><button id="gp-play">Play</button><button id="gp-next">Next</button><span id="gp-count"></span>';
    doc.body.prepend(controls);
    const script = doc.createElement('script');
    script.textContent = `(()=>{const steps=[...document.querySelectorAll('section[data-step]')];let i=0,t;const count=document.getElementById('gp-count');const show=()=>{steps.forEach((s,n)=>{s.style.opacity=n===i?'1':'.38';s.style.transition='opacity .35s';});count.textContent=(i+1)+' / '+steps.length;steps[i]?.scrollIntoView({behavior:'smooth',block:'center'});};document.getElementById('gp-prev').onclick=()=>{i=Math.max(0,i-1);show();};document.getElementById('gp-next').onclick=()=>{i=Math.min(steps.length-1,i+1);show();};document.getElementById('gp-play').onclick=e=>{if(t){clearInterval(t);t=null;e.target.textContent='Play';return;}e.target.textContent='Pause';show();t=setInterval(()=>{if(i>=steps.length-1){clearInterval(t);t=null;e.target.textContent='Play';return;}i++;show();},3500);};count.textContent='1 / '+steps.length;})();`;
    doc.body.append(script);
    downloadBlob(new Blob(['<!doctype html>\n' + doc.documentElement.outerHTML], { type: 'text/html' }), `${name}.html`);
  }
}

export function exportReviewRecord(workspace: Workspace) {
  const record = {
    format: 'guidepatch-review-v1', title: workspace.title, exportedAt: new Date().toISOString(),
    source: workspace.analysis.source, model: workspace.analysis.model ?? null,
    order: workspace.order, oldGuide: workspace.oldGuide.guide.title, newGuide: workspace.newGuide.guide.title,
    sources: {
      old: { guideId: workspace.oldGuide.guide.id, fileName: workspace.oldGuide.fileName, createdAt: workspace.oldGuide.guide.createdAt },
      new: { guideId: workspace.newGuide.guide.id, fileName: workspace.newGuide.fileName, createdAt: workspace.newGuide.guide.createdAt },
    },
    rows: workspace.rows,
    outputStepIds: buildReviewedGuide(workspace).steps.map(s => s.id),
  };
  downloadBlob(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }), 'guidepatch-review.json');
}
