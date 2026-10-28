import type { Step, Screenshot } from '@mimik/core/guides/types';
import type { Alignment, ImportedGuide, ReviewRow, Workspace } from '../domain';

const normal = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function localAlign(oldSteps: Step[], newSteps: Step[]): Alignment[] {
  const used = new Set<string>();
  const rows: Alignment[] = [];
  for (const old of oldSteps) {
    const candidates = newSteps.filter(n => !used.has(n.id) && n.action === old.action && normal(n.description) === normal(old.description));
    const oldCount = oldSteps.filter(s => s.action === old.action && normal(s.description) === normal(old.description)).length;
    const match = oldCount === 1 && candidates.length === 1 ? candidates[0] : undefined;
    if (match) used.add(match.id);
    rows.push({ oldId: old.id, newId: match?.id ?? null, kind: match ? 'unchanged' : 'removed',
      reason: match ? 'Same recorded action and description.' : 'No unique exact match. Match it manually or request semantic alignment.',
      description: match?.description ?? old.description, uncertainty: match ? '' : 'Local comparison only; a renamed step may appear as removed and added.' });
  }
  for (const step of newSteps) if (!used.has(step.id)) rows.push({ oldId: null, newId: step.id, kind: 'added', reason: 'New or renamed step without a unique exact match.', description: step.description, uncertainty: 'Review against the old recording.' });
  return validateAlignment(rows, oldSteps, newSteps);
}

export function validateAlignment(rows: Alignment[], oldSteps: Step[], newSteps: Step[]): Alignment[] {
  const oldMap = new Map(oldSteps.map(s => [s.id, s]));
  const newMap = new Map(newSteps.map(s => [s.id, s]));
  const oldSeen = new Set<string>(), newSeen = new Set<string>();
  const validKinds = ['unchanged', 'changed', 'moved', 'added', 'removed'];
  if (!Array.isArray(rows) || rows.length > oldSteps.length + newSteps.length) throw new Error('The alignment is incomplete or malformed. Your recordings are unchanged.');
  for (const r of rows) {
    if (!r || (!r.oldId && !r.newId) || !validKinds.includes(r.kind) || typeof r.reason !== 'string' || typeof r.description !== 'string' || typeof r.uncertainty !== 'string') throw new Error('The alignment has an invalid row.');
    if (r.oldId !== null && (!oldMap.has(r.oldId) || oldSeen.has(r.oldId))) throw new Error('The alignment repeats or invents an original step.');
    if (r.newId !== null && (!newMap.has(r.newId) || newSeen.has(r.newId))) throw new Error('The alignment repeats or invents an updated step.');
    if (r.oldId) oldSeen.add(r.oldId);
    if (r.newId) newSeen.add(r.newId);
    if ((!r.oldId && r.kind !== 'added') || (!r.newId && r.kind !== 'removed') || (r.oldId && r.newId && ['added', 'removed'].includes(r.kind))) throw new Error('The alignment has an invalid addition or removal.');
  }
  if (oldSeen.size !== oldMap.size || newSeen.size !== newMap.size) throw new Error('The alignment omits recorded steps.');
  const paired = rows.filter(r => r.oldId && r.newId);
  const oldRank = [...paired].sort((a, b) => oldMap.get(a.oldId!)!.index - oldMap.get(b.oldId!)!.index);
  const newRank = [...paired].sort((a, b) => newMap.get(a.newId!)!.index - newMap.get(b.newId!)!.index);
  return rows.map(r => {
    if (!r.oldId || !r.newId) return { ...r };
    const old = oldMap.get(r.oldId)!, updated = newMap.get(r.newId)!;
    const suggestedWordingChanged = Boolean(r.description) && r.description !== updated.description;
    const changed = r.imageChanged || suggestedWordingChanged || old.description !== updated.description || old.action !== updated.action || old.url !== updated.url || Boolean(old.blockType) !== Boolean(updated.blockType);
    const moved = oldRank.indexOf(r) !== newRank.indexOf(r);
    return { ...r, kind: changed ? 'changed' : moved ? 'moved' : 'unchanged', moved, description: r.description || updated.description };
  });
}

export function makeRows(rows: Alignment[]): ReviewRow[] {
  return rows.map((r, i) => ({ ...r, id: `change-${i}`, decision: r.kind === 'unchanged' ? 'accept' : 'pending' }));
}

export function manualPair(rows: ReviewRow[], removedId: string, addedId: string, oldSteps: Step[], newSteps: Step[]): ReviewRow[] {
  const removed = rows.find(r => r.id === removedId), added = rows.find(r => r.id === addedId);
  if (!removed?.oldId || removed.newId || !added?.newId || added.oldId) throw new Error('Choose one unmatched old step and one unmatched new step.');
  const merged: Alignment = { oldId: removed.oldId, newId: added.newId, kind: 'changed', reason: 'Matched by the reviewer.', description: added.description, uncertainty: '' };
  const retained = rows.filter(r => r !== removed && r !== added);
  const normalized = validateAlignment([...retained, merged], oldSteps, newSteps);
  return normalized.map((r, i) => {
    const previous = retained.find(p => p.oldId === r.oldId && p.newId === r.newId);
    return previous ? { ...previous, kind: r.kind, moved: r.moved } : { ...r, kind: 'changed', id: `manual-${Date.now()}-${i}`, decision: 'pending' };
  });
}

export function unpair(rows: ReviewRow[], id: string, oldSteps: Step[], newSteps: Step[]): ReviewRow[] {
  const row = rows.find(r => r.id === id);
  if (!row?.oldId || !row.newId) throw new Error('This step is already unmatched.');
  const old = oldSteps.find(s => s.id === row.oldId)!;
  const updated = newSteps.find(s => s.id === row.newId)!;
  const retained = rows.filter(r => r.id !== id);
  const normalized = validateAlignment([...retained,
    { oldId: old.id, newId: null, kind: 'removed', reason: 'The reviewer marked these as different steps.', description: old.description, uncertainty: '' },
    { oldId: null, newId: updated.id, kind: 'added', reason: 'The reviewer marked these as different steps.', description: updated.description, uncertainty: '' },
  ], oldSteps, newSteps);
  return normalized.map((r, i) => {
    const previous = retained.find(p => p.oldId === r.oldId && p.newId === r.newId);
    return previous ? { ...previous, kind: r.kind, moved: r.moved } : { ...r, id: `unpaired-${Date.now()}-${i}`, decision: 'pending' };
  });
}

export function proposedWording(row: ReviewRow, oldSteps: Step[]): string {
  if (row.editedDescription !== undefined) return row.editedDescription;
  const old = oldSteps.find(s => s.id === row.oldId);
  return old && ['manual', 'narration'].includes(old.descriptionSource ?? '') ? old.description : row.description;
}

export function noteAnchor(row: ReviewRow, oldSteps: Step[]): { oldId: string | null; position: 'before' | 'after' } {
  if (row.noteAnchorOldId !== undefined) return { oldId: row.noteAnchorOldId, position: row.notePosition ?? 'after' };
  const i = oldSteps.findIndex(s => s.id === row.oldId);
  const block = oldSteps[i];
  const before = oldSteps.slice(0, i);
  const sectionStart = before.findLastIndex(s => s.blockType === 'heading');
  const previous = before.slice(sectionStart + 1).findLast(s => !s.blockType);
  const next = oldSteps.slice(i + 1).find(s => !s.blockType);
  if (block?.blockType === 'callout' && previous) return { oldId: previous.id, position: row.notePosition ?? 'after' };
  return { oldId: next?.id ?? null, position: row.notePosition ?? 'before' };
}

export function buildReviewedGuide(workspace: Workspace): ImportedGuide {
  const { rows, oldGuide, newGuide, order } = workspace;
  const oldMap = new Map(oldGuide.steps.map(s => [s.id, s]));
  const newMap = new Map(newGuide.steps.map(s => [s.id, s]));
  const primaryId = (r: ReviewRow) => order === 'latest' ? r.newId : r.oldId;
  const secondaryId = (r: ReviewRow) => order === 'latest' ? r.oldId : r.newId;
  const primary = order === 'latest' ? newMap : oldMap;
  const secondary = order === 'latest' ? oldMap : newMap;
  const oldBlocks = order === 'latest' ? rows.filter(r => r.oldId && !r.newId && oldMap.get(r.oldId)?.blockType) : [];
  const mainRows = rows.filter(r => !oldBlocks.includes(r));
  let ordered = mainRows.filter(r => primaryId(r)).sort((a, b) => primary.get(primaryId(a)!)!.index - primary.get(primaryId(b)!)!.index);
  const extras = mainRows.filter(r => !primaryId(r)).sort((a, b) => secondary.get(secondaryId(a)!)!.index - secondary.get(secondaryId(b)!)!.index);
  for (const extra of extras) {
    const at = secondary.get(secondaryId(extra)!)!.index;
    const next = mainRows.filter(r => primaryId(r) && secondaryId(r) && secondary.get(secondaryId(r)!)!.index > at)
      .sort((a, b) => secondary.get(secondaryId(a)!)!.index - secondary.get(secondaryId(b)!)!.index)[0];
    ordered.splice(next ? ordered.indexOf(next) : ordered.length, 0, extra);
  }
  if (oldBlocks.length) {
    const before = new Map<ReviewRow, ReviewRow[]>(), after = new Map<ReviewRow, ReviewRow[]>(), end: ReviewRow[] = [];
    for (const block of oldBlocks.sort((a, b) => oldMap.get(a.oldId!)!.index - oldMap.get(b.oldId!)!.index)) {
      const anchor = noteAnchor(block, oldGuide.steps);
      const target = ordered.find(r => r.oldId === anchor.oldId);
      if (!target) { end.push(block); continue; }
      const bucket = anchor.position === 'before' ? before : after;
      bucket.set(target, [...(bucket.get(target) ?? []), block]);
    }
    ordered = ordered.flatMap(r => [...(before.get(r) ?? []), r, ...(after.get(r) ?? [])]).concat(end);
  }
  const output: Step[] = [], screenshots = new Map<string, Screenshot>();
  const guideId = 'guidepatch-reviewed';
  for (const row of ordered) {
    const useNew = row.decision === 'accept' && row.newId !== null;
    if (row.decision === 'accept' && !row.newId) continue;
    if (row.decision !== 'accept' && !row.oldId) continue;
    const original = useNew ? newMap.get(row.newId!)! : oldMap.get(row.oldId!)!;
    const source = useNew ? newGuide : oldGuide;
    const id = `${useNew ? 'new' : 'old'}-${original.id}`;
    const step = { ...original, id, guideId, index: output.length };
    if (row.decision === 'accept' && row.newId) {
      step.description = proposedWording(row, oldGuide.steps);
      const old = row.oldId ? oldMap.get(row.oldId) : undefined;
      if (row.editedDescription !== undefined || ['manual', 'narration'].includes(old?.descriptionSource ?? '')) step.descriptionSource = 'manual';
    }
    output.push(step);
    const shot = source.screenshots.get(original.id);
    if (shot) screenshots.set(id, { ...shot, id: `shot-${id}`, stepId: id });
  }
  const now = Date.now();
  return { guide: { ...oldGuide.guide, id: guideId, title: workspace.title, updatedAt: now, stepIds: output.map(s => s.id) }, steps: output, screenshots, fileName: 'reviewed.mimik' };
}

export function requestSteps(guide: ImportedGuide) {
  return guide.steps.map(s => {
    let url = '';
    try { const u = new URL(s.url); url = u.origin + u.pathname; } catch {}
    return { id: s.id, index: s.index, description: s.description, action: s.action, url, label: s.elementMeta?.ariaLabel || s.elementMeta?.textContent || s.elementMeta?.name || '' };
  });
}
