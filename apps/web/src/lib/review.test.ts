import { describe, it, expect } from 'vitest';
import { localAlign, makeRows, validateAlignment, buildReviewedGuide, manualPair, unpair, requestSteps, proposedWording } from './review';
import { withImageChanges, exportReviewed } from './guide-files';
import type { Step } from '@mimik/core/guides/types';
import type { ImportedGuide, Workspace } from '../domain';

const step = (id: string, index: number, description: string): Step => ({ id, index, description, guideId: 'g', action: 'click', url: 'https://example.test/settings', timestamp: 1 });
const guide = (steps: Step[]): ImportedGuide => ({ guide: { id: 'g', title: 'Guide', createdAt: 1, updatedAt: 1, stepIds: steps.map(s => s.id), starred: false, deletedAt: null }, steps, screenshots: new Map(), fileName: 'guide.mimik' });

describe('one-to-one evidence and review semantics', () => {
  it('does not confuse an inserted step with every later step having moved', () => {
    const a = [step('a', 0, 'Open'), step('b', 1, 'Save')];
    const b = [step('x', 0, 'Open'), step('y', 1, 'Choose role'), step('z', 2, 'Save')];
    expect(localAlign(a, b).map(r => r.kind)).toEqual(['unchanged', 'unchanged', 'added']);
  });
  it('keeps ambiguous repeated descriptions unmatched instead of inventing correspondence', () => {
    const rows = localAlign([step('a', 0, 'Continue')], [step('x', 0, 'Continue'), step('y', 1, 'Continue')]);
    expect(rows.map(r => r.kind)).toEqual(['removed', 'added', 'added']);
  });
  it('rejects omitted, repeated and invented IDs', () => {
    const a = [step('a', 0, 'Open')], b = [step('b', 0, 'Open')];
    const r = localAlign(a, b);
    expect(() => validateAlignment([], a, b)).toThrow('omits');
    expect(() => validateAlignment([r[0], r[0]], a, b)).toThrow('repeats');
    expect(() => validateAlignment([{ ...r[0], newId: 'made-up' }], a, b)).toThrow('invents');
  });
  it('supports reviewer pairing without dropping other rows or decisions', () => {
    const a = [step('a', 0, 'Invite')], b = [step('b', 0, 'Add member'), step('c', 1, 'Choose role')];
    const rows = makeRows(localAlign(a, b));
    rows[2].decision = 'reject';
    const paired = manualPair(rows, rows[0].id, rows[1].id, a, b);
    expect(paired).toHaveLength(2);
    expect(paired.find(r => r.newId === 'c')?.decision).toBe('reject');
    expect(paired.find(r => r.oldId === 'a')?.newId).toBe('b');
  });
  it('reject keeps original content, accepts additions, retains rejected removal, preserves image ownership', () => {
    const old = guide([step('a', 0, 'Invite'), step('d', 1, 'Read note')]);
    const updated = guide([step('b', 0, 'Add member'), step('c', 1, 'Choose role')]);
    old.screenshots.set('a', { id: 'sa', stepId: 'a', blob: new Blob(['old']), mimeType: 'image/png', width: 10, height: 10 });
    const rows = makeRows(validateAlignment([
      { oldId: 'a', newId: 'b', kind: 'changed', reason: '', description: 'Add member', uncertainty: '' },
      { oldId: 'd', newId: null, kind: 'removed', reason: '', description: '', uncertainty: '' },
      { oldId: null, newId: 'c', kind: 'added', reason: '', description: 'Choose role', uncertainty: '' },
    ], old.steps, updated.steps));
    rows[0].decision = 'reject'; rows[1].decision = 'reject'; rows[2].decision = 'accept';
    const w: Workspace = { oldGuide: old, newGuide: updated, rows, analysis: { source: 'local', alignments: rows }, order: 'original', title: 'Reviewed', savedAt: 1 };
    const result = buildReviewedGuide(w);
    expect(result.steps.map(s => s.description)).toEqual(['Invite', 'Read note', 'Choose role']);
    expect(result.screenshots.get('old-a')?.blob).toBe(old.screenshots.get('a')?.blob);
    expect(old.steps[0].description).toBe('Invite');
  });
  it('latest and original order remain separate from content decisions', () => {
    const old = guide([step('a', 0, 'Open'), step('b', 1, 'Save')]);
    const updated = guide([step('x', 0, 'Save'), step('y', 1, 'Open')]);
    const rows = makeRows(localAlign(old.steps, updated.steps)); rows.forEach(r => r.decision = 'accept');
    const w: Workspace = { oldGuide: old, newGuide: updated, rows, analysis: { source: 'local', alignments: rows }, order: 'original', title: 'Reviewed', savedAt: 1 };
    expect(buildReviewedGuide(w).steps.map(s => s.description)).toEqual(['Open', 'Save']);
    expect(buildReviewedGuide({ ...w, order: 'latest' }).steps.map(s => s.description)).toEqual(['Save', 'Open']);
  });
  it('sends no inputValue, screenshot, or URL query to the server', () => {
    const s = { ...step('a', 0, 'Open'), url: 'https://example.test/settings?token=secret#anchor', inputValue: 'private' };
    const text = JSON.stringify(requestSteps(guide([s])));
    expect(text).not.toContain('secret'); expect(text).not.toContain('private'); expect(text).not.toContain('screenshot');
  });
  it('allows a reviewer to correct a structurally valid but wrong semantic pair', () => {
    const a = [step('same-id', 0, 'Save settings')], b = [step('same-id', 0, 'Delete workspace')];
    const paired = makeRows(validateAlignment([{ oldId: 'same-id', newId: 'same-id', kind: 'changed', reason: 'Model proposal', description: 'Delete workspace', uncertainty: '' }], a, b));
    const split = unpair(paired, paired[0].id, a, b);
    expect(split.map(r => r.kind)).toEqual(['removed', 'added']);
    expect(split[0].oldId).toBe('same-id'); expect(split[1].newId).toBe('same-id');
  });
  it('preserves the combined changed-and-moved condition', () => {
    const a = [step('a', 0, 'Open'), step('b', 1, 'Invite')], b = [step('x', 0, 'Add member'), step('y', 1, 'Open')];
    const rows = validateAlignment([{ oldId:'a',newId:'y',kind:'unchanged',reason:'',description:'Open',uncertainty:'' },{oldId:'b',newId:'x',kind:'changed',reason:'',description:'Add member',uncertainty:''}], a, b);
    expect(rows[1].kind).toBe('changed'); expect(rows[1].moved).toBe(true);
  });
  it('inserts a new first step before its next matched neighbour while preserving original order', () => {
    const old = guide([step('a', 0, 'Open'), step('b', 1, 'Save')]);
    const updated = guide([step('x', 0, 'Sign in'), step('y', 1, 'Open'), step('z', 2, 'Save')]);
    const rows = makeRows(localAlign(old.steps, updated.steps)); rows.forEach(r => r.decision = 'accept');
    const w: Workspace = { oldGuide: old, newGuide: updated, rows, analysis: { source: 'local', alignments: rows }, order: 'original', title: 'Reviewed', savedAt: 1 };
    expect(buildReviewedGuide(w).steps.map(s => s.description)).toEqual(['Sign in', 'Open', 'Save']);
  });
  it('does not select the first of duplicated old descriptions or duplicate descriptions on both sides', () => {
    expect(localAlign([step('a',0,'Save'),step('b',1,'Save')],[step('x',0,'Save')]).every(r => r.kind !== 'unchanged')).toBe(true);
    expect(localAlign([step('a',0,'Save'),step('b',1,'Save')],[step('x',0,'Save'),step('y',1,'Save')]).every(r => r.kind !== 'unchanged')).toBe(true);
  });
  it('keeps unrelated screenshot changes pending through manual pairing and unlinking', async () => {
    const a=guide([step('open',0,'Open Members'),step('invite',1,'Invite')]);
    const b=guide([step('open-new',0,'Open Members'),step('add',1,'Add member')]);
    a.screenshots.set('open',{id:'a',stepId:'open',blob:new Blob(['before']),mimeType:'image/png',width:10,height:10});
    b.screenshots.set('open-new',{id:'b',stepId:'open-new',blob:new Blob(['after']),mimeType:'image/png',width:10,height:10});
    const rows=makeRows(await withImageChanges(localAlign(a.steps,b.steps),a,b));
    const changed=rows.find(r=>r.oldId==='open')!;
    const paired=manualPair(rows,rows.find(r=>r.oldId==='invite')!.id,rows.find(r=>r.newId==='add')!.id,a.steps,b.steps);
    expect(paired.find(r=>r.oldId==='open')).toMatchObject({kind:'changed',imageChanged:true,decision:'pending'});
    expect(paired.find(r=>r.oldId==='open')!.id).toBe(changed.id);
    const split=unpair(paired,paired.find(r=>r.oldId==='invite')!.id,a.steps,b.steps);
    expect(split.find(r=>r.oldId==='open')).toMatchObject({kind:'changed',imageChanged:true,decision:'pending'});
  });
  it('moves retained headings and after-action warnings with their action groups', () => {
    const a=guide([
      {...step('h1',0,'Prepare workspace'),blockType:'heading',descriptionSource:'manual'},
      step('open',1,'Open settings'),
      {...step('note',2,'After opening settings, check the current workspace.'),blockType:'callout',calloutVariant:'warning',descriptionSource:'manual'},
      {...step('h2',3,'Invite teammate'),blockType:'heading',descriptionSource:'manual'},
      step('invite',4,'Click Invite'),
    ]);
    const b=guide([step('invite-new',0,'Click Invite'),step('open-new',1,'Open settings')]);
    const rows=makeRows(localAlign(a.steps,b.steps)); rows.forEach(r=>r.decision=r.oldId&&r.newId?'accept':'reject');
    const w:Workspace={oldGuide:a,newGuide:b,rows,analysis:{source:'local',alignments:rows},order:'latest',title:'Reviewed',savedAt:1};
    expect(buildReviewedGuide(w).steps.map(s=>s.description)).toEqual(['Invite teammate','Click Invite','Prepare workspace','Open settings','After opening settings, check the current workspace.']);
  });
  it('updates the recorded action and image while preserving manually edited wording by default', () => {
    const old={...step('invite',0,'Click Invite. Confirm the current workspace; do not assign Owner.'),descriptionSource:'manual' as const};
    const updated={...step('add',0,'Click Add member.'),url:'https://example.test/new-members',descriptionSource:'heuristic' as const};
    const a=guide([old]), b=guide([updated]);
    b.screenshots.set('add',{id:'new-shot',stepId:'add',blob:new Blob(['new']),mimeType:'image/png',width:10,height:10});
    const rows=makeRows([{oldId:'invite',newId:'add',kind:'changed',description:updated.description,reason:'Renamed',uncertainty:''}]);rows[0].decision='accept';
    const w:Workspace={oldGuide:a,newGuide:b,rows,analysis:{source:'local',alignments:rows},order:'latest',title:'Reviewed',savedAt:1};
    expect(proposedWording(rows[0],a.steps)).toBe(old.description);
    const output=buildReviewedGuide(w);
    expect(output.steps[0].description).toBe(old.description);
    expect(output.steps[0].url).toBe(updated.url);
    expect(output.screenshots.get('new-add')?.blob).toBe(b.screenshots.get('add')?.blob);
    rows[0].editedDescription='Click Add member. Confirm the current workspace; do not assign Owner.';
    expect(buildReviewedGuide(w).steps[0].description).toContain('Click Add member. Confirm');
  });
  it('blocks export for an unconfirmed manual match even if a later match normalizes it to unchanged', async () => {
    const a=guide([step('c1',0,'Continue'),step('c2',1,'Continue'),step('invite',2,'Invite')]);
    const b=guide([step('ca',0,'Continue'),step('cb',1,'Continue'),step('add',2,'Add member')]);
    let rows=makeRows(localAlign(a.steps,b.steps));
    rows=manualPair(rows,rows.find(r=>r.oldId==='c1')!.id,rows.find(r=>r.newId==='ca')!.id,a.steps,b.steps);
    rows=manualPair(rows,rows.find(r=>r.oldId==='invite')!.id,rows.find(r=>r.newId==='add')!.id,a.steps,b.steps);
    rows.forEach(r=>r.decision=r.oldId==='c1'?'pending':'accept');
    expect(rows.find(r=>r.oldId==='c1')).toMatchObject({kind:'unchanged',decision:'pending'});
    const w:Workspace={oldGuide:a,newGuide:b,rows,analysis:{source:'local',alignments:rows},order:'latest',title:'Reviewed',savedAt:1};
    await expect(exportReviewed(w,'bundle')).rejects.toThrow('Review every change');
    await expect(exportReviewed(w,'html')).rejects.toThrow('Review every change');
  });
});
