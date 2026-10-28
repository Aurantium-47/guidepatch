import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleHelp, Columns2, ExternalLink, FileArchive, FileCheck2, GitCompareArrows, History, Layers2, LoaderCircle, LockKeyhole, PanelLeftClose, Pause, Play, Plus, Radio, RefreshCw, Settings2, ShieldCheck, Sparkles, Undo2, Upload, X } from 'lucide-react';
import type { ImportedGuide, Workspace } from './domain';
import { localAlign, makeRows, manualPair, unpair, proposedWording, noteAnchor, buildReviewedGuide, requestSteps } from './lib/review';
import { importGuide, exportReviewed, exportReviewRecord, withImageChanges } from './lib/guide-files';
import { getStatus, semanticAlign, type ServerStatus } from './lib/api';
import { loadWorkspace, saveWorkspace } from './lib/storage';
import { Screenshot } from './components/Screenshot';

export function App() {
  const [oldGuide, setOldGuide] = useState<ImportedGuide | null>(null);
  const [newGuide, setNewGuide] = useState<ImportedGuide | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [undo, setUndo] = useState<Workspace[]>([]);
  const [tab, setTab] = useState<'review' | 'preview' | 'activity'>('review');
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'changes'>('all');
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'settings' | 'privacy' | 'help' | null>(null);
  const [token, setToken] = useState('');
  const [pairWith, setPairWith] = useState('');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focused, setFocused] = useState(true);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>('saved');
  const oldInput = useRef<HTMLInputElement>(null), newInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => {});
    loadWorkspace().then(w => { if (w) { setWorkspace(w); setOldGuide(w.oldGuide); setNewGuide(w.newGuide); setSelected(w.rows[0]?.id ?? ''); setMessage('Restored your last review from this browser.'); } setRestored(true); }).catch(() => { setRestored(true); setError('Browser storage is unavailable. You can review and export, but this session will not be saved.'); });
  }, []);
  useEffect(() => {
    if (!workspace || !restored) return;
    let active = true;
    setSaveState('saving');
    const timer = setTimeout(() => {
      saveWorkspace(workspace).then(() => { if (active) setSaveState('saved'); }).catch(() => {
        if (active) { setSaveState('failed'); setError('This browser could not save your workspace. Export the guide and review record before leaving.'); }
      });
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [workspace, restored]);
  useEffect(() => { setFrame(0); setPlaying(false); }, [tab]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    if (!playing || !workspace) return;
    const count = buildReviewedGuide(workspace).steps.length;
    const timer = setInterval(() => setFrame(i => { if (i >= count - 1) { setPlaying(false); return i; } return i + 1; }), 3500);
    return () => clearInterval(timer);
  }, [playing, workspace]);

  const change = (next: Workspace, remember = true) => {
    if (workspace && remember) setUndo(u => [...u, workspace].slice(-25));
    setWorkspace({ ...next, savedAt: Date.now() });
  };
  const fail = (e: unknown) => { setError(e instanceof Error ? e.message : 'This action could not finish.'); setBusy(false); };
  const begin = async (a = oldGuide, b = newGuide) => {
    if (!a || !b) return;
    setBusy(true); setError('');
    try {
      const rows = await withImageChanges(localAlign(a.steps, b.steps), a, b);
      const w: Workspace = { oldGuide: a, newGuide: b, rows: makeRows(rows), analysis: { source: 'local', alignments: rows }, order: 'latest', title: a.guide.title, savedAt: Date.now() };
      change(w); setSelected(w.rows[0]?.id ?? ''); setTab('review'); setFilter('all');
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const chooseFile = async (file: File | undefined, side: 'old' | 'new') => {
    if (!file) return;
    if (workspace && !window.confirm('Replace this recording and start a new comparison? Your existing original files will stay unchanged.')) return;
    setBusy(true); setError('');
    try {
      const data = await importGuide(file);
      if (side === 'old') setOldGuide(data); else setNewGuide(data);
      setWorkspace(null); setUndo([]); setMessage(`${side === 'old' ? 'Original' : 'Updated'} guide opened: ${data.steps.length} steps.`);
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const demo = async () => {
    if (workspace && !window.confirm('Open the demonstration pair? You can return with Undo after the comparison loads.')) return;
    setBusy(true); setError('');
    try {
      const pair = await Promise.all(['old', 'new'].map(async side => {
        const r = await fetch(`/demo/${side}.mimik`);
        if (!r.ok) throw new Error('The demonstration files are unavailable. Import your own Mimik files.');
        return importGuide(new File([await r.blob()], `${side}-demo.mimik`, { type: 'application/zip' }));
      }));
      setOldGuide(pair[0]); setNewGuide(pair[1]); await begin(pair[0], pair[1]);
      setMessage('Demo loaded: an owned sample app, synthetic data, actual browser screenshots. Comparison is local until you explicitly run Nemotron.');
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const runAI = async () => {
    if (!workspace) return;
    if (workspace.rows.some(r => r.decision === 'reject' || r.editedDescription !== undefined || (r.kind !== 'unchanged' && r.decision === 'accept')) && !window.confirm('New alignment will replace the current suggestions and reset review decisions. You can restore the previous review with Undo. Continue?')) return;
    const base = workspace;
    setModal(null); setBusy(true); setError('');
    try {
      const result = await semanticAlign(base.oldGuide, base.newGuide, token);
      const rows = await withImageChanges(result.alignments, base.oldGuide, base.newGuide);
      const next = { ...base, rows: makeRows(rows), analysis: { ...result, alignments: rows } };
      change(next); setSelected(next.rows[0]?.id ?? ''); setMessage(`Semantic alignment complete with ${result.model}. Review every proposed change.`);
      getStatus().then(setStatus).catch(() => {});
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const decide = (decision: 'accept' | 'reject') => {
    if (!workspace || !row) return;
    change({ ...workspace, rows: workspace.rows.map(r => r.id === row.id ? { ...r, decision, editedDescription: decision === 'accept' ? proposedWording(r, workspace.oldGuide.steps) : undefined } : r) });
    setMessage(decision === 'accept' ? 'Update accepted. The source recordings are unchanged.' : 'Original content kept for this change.');
  };
  const exportFile = async (kind: 'html' | 'bundle') => {
    if (!workspace) return;
    setBusy(true); setError('');
    try { await exportReviewed(workspace, kind); setMessage(`${kind === 'html' ? 'Playable HTML' : 'Editable Mimik guide'} exported.`); } catch (e) { fail(e); }
    setBusy(false);
  };

  const rows = workspace?.rows ?? [];
  const changes = rows.filter(r => r.kind !== 'unchanged' || r.decision === 'pending');
  const pending = rows.filter(r => r.decision === 'pending').length;
  const visible = rows.filter(r => filter === 'all' || (filter === 'pending' ? r.decision === 'pending' : r.kind !== 'unchanged' || r.decision === 'pending'));
  const row = rows.find(r => r.id === selected) ?? visible[0] ?? rows[0];
  const before = row?.oldId ? workspace?.oldGuide.steps.find(s => s.id === row.oldId) : undefined;
  const after = row?.newId ? workspace?.newGuide.steps.find(s => s.id === row.newId) : undefined;
  const preview = workspace ? buildReviewedGuide(workspace) : null;
  const previewStep = preview?.steps[Math.min(frame, preview.steps.length - 1)];
  const activeSource = workspace?.analysis.source === 'nebius' ? workspace.analysis.model : 'Local exact-match comparison';

  return <div className="app-shell">
    <aside className="rail">
      <a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark"><GitCompareArrows size={22}/></span>guidepatch<span className="brand-dot">.</span></a>
      <div className="rail-label">YOUR WORKSPACE</div>
      <button className={`rail-link ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}><Columns2 size={18}/>Compare & review{workspace && <span>{pending}</span>}</button>
      <button className={`rail-link ${tab === 'preview' ? 'active' : ''}`} disabled={!workspace} onClick={() => setTab('preview')}><Play size={18}/>Guide preview</button>
      <button className={`rail-link ${tab === 'activity' ? 'active' : ''}`} disabled={!workspace} onClick={() => setTab('activity')}><History size={18}/>Review record</button>
      <div className="rail-divider"/>
      <div className="rail-label">START WITH A RECORDING</div>
      <a className="rail-link muted" href="https://github.com/westpoint-io/mimik" target="_blank" rel="noreferrer"><Radio size={17}/>Record with Mimik<ExternalLink size={12}/></a>
      <button className="rail-link muted" onClick={demo} disabled={busy}><Layers2 size={17}/>Explore the demo</button>
      <div className="rail-note"><span className="mini-orbit"/><strong>Good guides evolve.</strong><p>Keep the steps.<br/>Update the story.</p></div>
      <div className="rail-bottom"><button className="rail-link muted" onClick={() => setModal('help')}><CircleHelp size={17}/>How it works</button><button className="rail-link muted" onClick={() => setModal('settings')}><Settings2 size={17}/>Connection settings</button><p>Built on Mimik · MIT</p></div>
    </aside>

    <main className="workbench">
      <header className="topbar"><div className="breadcrumb">WORKFLOWS<span>/</span><strong>{workspace ? 'Version review' : 'New comparison'}</strong></div><button className={`connection ${status?.enabled ? 'connected' : ''}`} onClick={() => setModal('settings')}><span/>{status?.enabled ? 'Nemotron ready' : 'Local review ready'}<ChevronRight size={13}/></button></header>
      <div className="page-heading"><div><div className="eyebrow">WORKFLOW MAINTENANCE, WITHOUT THE REWRITE</div><h1>{workspace ? <>A new version.<br/><span>A clearer guide.</span></> : <>Your workflow changed.<br/><span>Your guide can keep up.</span></>}</h1><p>{workspace ? 'Compare the evidence. Keep what works. Publish what changed.' : 'Turn two recordings into one carefully reviewed, ready-to-share guide.'}</p></div><div className="version-stamp"><span>01</span><ArrowRight size={25}/><span>02</span><small>CONTINUITY, BY DESIGN</small></div></div>

      {error && <div className="notice error" role="alert"><X size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      {message && <div className="notice" role="status"><Check size={16}/><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage('')}><X size={14}/></button></div>}

      <div className="input-strip"><button className="file-card" disabled={busy} onClick={() => oldInput.current?.click()}><span className="file-icon"><FileArchive size={22}/></span><span><small>ORIGINAL RECORDING</small><strong>{oldGuide?.guide.title ?? 'Choose the guide you have'}</strong><em>{oldGuide ? `${oldGuide.steps.length} steps · ${oldGuide.fileName}` : 'Import a .mimik file'}</em></span><Upload size={17}/></button><span className="input-arrow"><ArrowRight size={19}/></span><button className="file-card" disabled={busy} onClick={() => newInput.current?.click()}><span className="file-icon updated"><FileArchive size={22}/></span><span><small>UPDATED RECORDING</small><strong>{newGuide?.guide.title ?? 'Choose what changed'}</strong><em>{newGuide ? `${newGuide.steps.length} steps · ${newGuide.fileName}` : 'Import a .mimik file'}</em></span><Upload size={17}/></button>{!workspace && <button className="primary compare-start" disabled={!oldGuide || !newGuide || busy} onClick={() => begin()}><GitCompareArrows size={18}/>Compare guides</button>}</div>
      <input ref={oldInput} className="hidden" type="file" aria-label="Original guide file" accept=".mimik" onChange={e => { chooseFile(e.target.files?.[0], 'old'); e.target.value = ''; }}/>
      <input ref={newInput} className="hidden" type="file" aria-label="Updated guide file" accept=".mimik" onChange={e => { chooseFile(e.target.files?.[0], 'new'); e.target.value = ''; }}/>

      {!workspace ? <section className="welcome-panel"><div className="welcome-copy"><div className="small-tag"><Sparkles size={14}/> ONE RECORDING. THEN ONE MORE.</div><h2>Less rewriting.<br/>More keeping up.</h2><p>When a button moves, a form changes, or a whole step disappears, see exactly what your guide needs next.</p><button className="primary" onClick={demo} disabled={busy}>Try the invitation workflow<ArrowRight size={17}/></button><small>Owned demo application · synthetic data · real screenshots</small></div><div className="welcome-art" aria-hidden="true"><div className="art-guide old-art"><span>YOUR EXISTING GUIDE</span><div className="art-line"/><div className="art-line short"/><div className="art-button">Invite member</div><div className="art-step">03 <i>Enter email address</i></div><div className="art-step">04 <i>Send invite</i></div></div><div className="art-connector"><ArrowRight/></div><div className="art-guide new-art"><span>WHAT CHANGED</span><div className="art-line"/><div className="art-button">Add member <Check size={13}/></div><div className="art-step new">+ <i>Choose workspace role</i></div><div className="art-step new">+ <i>Confirm invitation</i></div><div className="art-reviewed"><ShieldCheck size={14}/>Ready for your review</div></div></div></section> : <>
        <div className="review-toolbar"><div className="tabs"><button className={tab === 'review' ? 'selected' : ''} onClick={() => setTab('review')}>Review changes <span>{changes.length}</span></button><button className={tab === 'preview' ? 'selected' : ''} onClick={() => setTab('preview')}>Preview guide</button><button className={tab === 'activity' ? 'selected' : ''} onClick={() => setTab('activity')}>Review record</button></div><div className="toolbar-actions"><button className="icon-button" title="Undo last review action" aria-label="Undo last review action" disabled={!undo.length || busy} onClick={() => { const previous = undo.at(-1)!; setWorkspace(previous); setOldGuide(previous.oldGuide); setNewGuide(previous.newGuide); setUndo(u => u.slice(0, -1)); setMessage('Previous review restored.'); }}><Undo2 size={17}/></button><button className="secondary" onClick={() => setModal('privacy')} disabled={busy || !status?.enabled}><Sparkles size={15}/>{busy ? 'Working…' : 'Align with Nemotron'}</button></div></div>
        <div className="analysis-line"><span className={`source-tag ${workspace.analysis.source === 'nebius' ? 'live' : ''}`}>{workspace.analysis.source === 'nebius' ? <Sparkles size={12}/> : <GitCompareArrows size={12}/>}{activeSource}</span><span>Screenshot evidence stays on this device</span><span className="right">{pending ? `${pending} changes to review` : 'All changes reviewed'}<span className="progress-track"><i style={{ width: `${changes.length ? (changes.length - pending) / changes.length * 100 : 100}%` }}/></span></span></div>

        {tab === 'review' && <section className="review-grid"><div className="change-list"><div className="list-header"><span>STEP CHANGES</span><select aria-label="Filter changes" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">All steps</option><option value="changes">Changes</option><option value="pending">Needs review</option></select></div>{visible.map((r) => <button key={r.id} data-testid="change-row" data-decision={r.decision} data-old-id={r.oldId ?? ''} data-new-id={r.newId ?? ''} className={`change-row ${row?.id === r.id ? 'selected' : ''}`} onClick={() => { setSelected(r.id); setPairWith(''); }}><span className={`step-index ${r.kind}`}>{r.kind === 'added' ? '+' : r.kind === 'removed' ? '−' : `${(workspace.oldGuide.steps.find(s => s.id === r.oldId)?.index ?? 0) + 1}→${(workspace.newGuide.steps.find(s => s.id === r.newId)?.index ?? 0) + 1}`}</span><span><strong>{(r.newId ? workspace.newGuide.steps.find(s => s.id === r.newId)?.description : workspace.oldGuide.steps.find(s => s.id === r.oldId)?.description) || 'Untitled step'}</strong><small>{r.kind}{r.moved && r.kind !== 'moved' ? ' · reordered' : ''}</small></span>{r.decision === 'pending' ? <span className="pending-dot"/> : <Check size={14} className="decided-check"/>}</button>)}{!visible.length && <p className="empty-list">Nothing waiting here.</p>}<div className="list-foot"><ShieldCheck size={14}/><span>One source step, one clear decision.</span></div></div>
          <div className="detail-panel">{row && <><div className="detail-heading"><div><span className={`kind-badge ${row.kind}`}>{row.kind}</span>{row.moved && row.kind !== 'moved' && <span className="kind-badge moved">reordered</span>}<h2>{row.kind === 'added' ? 'A new step in the workflow.' : row.kind === 'removed' ? 'This step is no longer recorded.' : row.kind === 'unchanged' ? 'The same step, carried forward.' : 'A detail worth updating.'}</h2></div><span className={`decision-label ${row.decision}`}>{row.decision === 'pending' ? 'Needs your review' : row.decision === 'accept' ? 'Update accepted' : 'Original kept'}</span></div><div className="compare-pair"><article className="evidence"><div className="evidence-label"><span className="version-dot"/>BEFORE<span>{before ? `Step ${before.index + 1}` : 'No corresponding step'}</span></div><div className="browser-frame"><div className="browser-chrome"><i/><i/><i/><span>Original recording</span></div>{before ? <Screenshot shot={workspace.oldGuide.screenshots.get(before.id)} alt={`Original: ${before.description}`}/> : <div className="shot-empty"><Plus size={25}/><span>New in the updated recording</span></div>}</div><p>{before?.description ?? 'There was no matching recorded step in the original guide.'}</p></article><article className="evidence newer"><div className="evidence-label"><span className="version-dot"/>AFTER<span>{after ? `Step ${after.index + 1}` : 'Not present'}</span></div><div className="browser-frame"><div className="browser-chrome"><i/><i/><i/><span>Updated recording</span></div>{after ? <Screenshot shot={workspace.newGuide.screenshots.get(after.id)} alt={`Updated: ${after.description}`}/> : <div className="shot-empty"><PanelLeftClose size={25}/><span>Not in the updated recording</span></div>}</div><p>{after?.description ?? 'Keep the old step if it is still relevant to your guide.'}</p></article></div><div className="reason-box"><GitCompareArrows size={18}/><div><strong>{workspace.analysis.source === 'nebius' ? 'Alignment note' : 'Local comparison note'}</strong><p>{row.reason}</p>{row.uncertainty && <small>{row.uncertainty}</small>}</div></div>
          {row.kind === 'removed' && <div className="manual-match"><label htmlFor="pair">Is this a renamed step?</label><select id="pair" disabled={busy} value={pairWith} onChange={e => setPairWith(e.target.value)}><option value="">Choose an unmatched updated step</option>{rows.filter(r => r.kind === 'added').map(r => <option key={r.id} value={r.id}>{r.description}</option>)}</select><button className="secondary" disabled={!pairWith || busy} onClick={() => { try { const paired = manualPair(rows, row.id, pairWith, workspace.oldGuide.steps, workspace.newGuide.steps); change({ ...workspace, rows: paired }); setSelected(paired.at(-1)?.id ?? ''); setPairWith(''); } catch (e) { fail(e); } }}>Match steps</button></div>}
          <div className="unpair-action">{row.oldId && row.newId && <button className="text-button" disabled={busy} onClick={() => { const split = unpair(rows, row.id, workspace.oldGuide.steps, workspace.newGuide.steps); change({ ...workspace, rows: split }); setSelected(split.at(-2)?.id ?? ''); }}>These are different steps — unlink</button>}</div><div className="wording">{before && ['manual', 'narration'].includes(before.descriptionSource ?? '') && after && <div className="editorial-choices"><span>Edited wording is preserved. Check the action name before publishing.</span><button disabled={busy} onClick={() => change({ ...workspace, rows: rows.map(r => r.id === row.id ? { ...r, editedDescription: before.description } : r) })}>Keep edited wording</button><button disabled={busy} onClick={() => change({ ...workspace, rows: rows.map(r => r.id === row.id ? { ...r, editedDescription: after.description } : r) })}>Use new recording text</button>{workspace.analysis.source === 'nebius' && <button disabled={busy} onClick={() => change({ ...workspace, rows: rows.map(r => r.id === row.id ? { ...r, editedDescription: row.description } : r) })}>Use model suggestion</button>}</div>}{before?.blockType && !after && workspace.order === 'latest' && <div className="note-anchor"><label>KEEP THIS NOTE WITH</label><select aria-label="Note anchor step" disabled={busy} value={noteAnchor(row, workspace.oldGuide.steps).oldId ?? ''} onChange={e => change({ ...workspace, rows: rows.map(r => r.id === row.id ? { ...r, noteAnchorOldId: e.target.value || null } : r) })}><option value="">End of guide</option>{workspace.oldGuide.steps.filter(s => !s.blockType).map(s => <option key={s.id} value={s.id}>{s.description}</option>)}</select><select aria-label="Note position" disabled={busy} value={noteAnchor(row, workspace.oldGuide.steps).position} onChange={e => change({ ...workspace, rows: rows.map(r => r.id === row.id ? { ...r, notePosition: e.target.value as 'before' | 'after' } : r) })}><option value="before">Before this step</option><option value="after">After this step</option></select></div>}<label htmlFor="wording">WORDING FOR THE UPDATED GUIDE <span>Editable · tied to this recording</span></label><textarea id="wording" disabled={busy} value={proposedWording(row, workspace.oldGuide.steps)} onChange={e => change({ ...workspace, rows: rows.map(r => r.id === row.id ? { ...r, editedDescription: e.target.value } : r) }, false)}/></div><div className="decision-actions"><p>{row.newId ? 'Accept uses the updated recording and wording.' : 'Accept removes this step from the guide.'}</p><button className="secondary" disabled={busy} onClick={() => decide('reject')}><ArrowLeft size={15}/>Keep original</button><button className="primary" disabled={busy} onClick={() => decide('accept')}><Check size={17}/>{row.kind === 'removed' ? 'Accept removal' : 'Accept update'}</button></div></> }</div></section>}

        {tab === 'preview' && preview && <section className="preview-layout"><div className="preview-main"><div className="preview-top"><span className="small-tag"><Play size={13}/>UPDATED GUIDE PREVIEW</span><label><input type="checkbox" checked={focused} onChange={e => setFocused(e.target.checked)}/>Focus on the action</label></div><h2>{workspace.title}</h2>{pending > 0 && <p className="draft-note">Draft: {pending} unresolved changes still use original content. Resolve them before final export.</p>}<div className="preview-image"><Screenshot shot={previewStep ? preview.screenshots.get(previewStep.id) : undefined} focus={focused} alt={previewStep?.description ?? 'Reviewed guide'}/></div><div className="playbar"><button aria-label="Previous step" disabled={frame <= 0} onClick={() => setFrame(i => Math.max(0, i - 1))}><ChevronLeft size={20}/></button><button className="play-circle" aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'} onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><button aria-label="Next step" disabled={frame >= preview.steps.length - 1} onClick={() => setFrame(i => Math.min(preview.steps.length - 1, i + 1))}><ChevronRight size={20}/></button><span>{String(frame + 1).padStart(2, '0')} / {String(preview.steps.length).padStart(2, '0')}</span><strong>{previewStep?.description}</strong></div></div><div className="preview-steps"><div className="rail-label">IN THIS GUIDE</div>{preview.steps.map((s, i) => <button key={s.id} className={i === frame ? 'active' : ''} onClick={() => setFrame(i)}><span>{String(i + 1).padStart(2, '0')}</span>{s.description}</button>)}</div></section>}

        {tab === 'activity' && <section className="activity-panel"><div><span className="small-tag"><FileCheck2 size={14}/>A REVIEW YOU CAN TRACE</span><h2>Every update has a source.</h2><p>Your decisions, corresponding step IDs and model provenance travel with the review record.</p></div><table><thead><tr><th>Original step</th><th>Updated step</th><th>Change</th><th>Decision</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.oldId ?? '—'}</td><td>{r.newId ?? '—'}</td><td><span className={`kind-badge ${r.kind}`}>{r.kind}</span></td><td>{r.decision}</td></tr>)}</tbody></table><button className="secondary" onClick={() => exportReviewRecord(workspace)}><ArrowDownToLine size={16}/>Download review record</button></section>}

        <footer className="export-bar"><div className="order-choice"><label htmlFor="order">FINAL STEP ORDER</label><select id="order" disabled={busy} value={workspace.order} onChange={e => change({ ...workspace, order: e.target.value as Workspace['order'] })}><option value="latest">Updated recording order</option><option value="original">Original recording order</option></select><small>Content decisions and ordering are separate.</small></div><div className="export-actions"><div><strong>{pending ? `${pending} changes need a decision` : 'Ready to share.'}</strong><small>{pending ? 'Review, accept or keep the original.' : `${preview?.steps.length ?? 0} reviewed steps`}</small></div><button className="secondary" disabled={busy || pending > 0} onClick={() => exportFile('bundle')}><FileArchive size={16}/>Mimik file</button><button className="primary" disabled={busy || pending > 0} onClick={() => exportFile('html')}><ArrowDownToLine size={17}/>Export walkthrough</button></div></footer>
      </>}
      <div className="page-footer"><span><LockKeyhole size={12}/>Screenshots remain local. Model analysis sends only the step text you review.</span><span>{workspace && <b className="save-state">{saveState === 'saved' ? 'Saved in this browser' : saveState === 'saving' ? 'Saving…' : 'Save failed'}</b>}Mimik bundle v1 · GuidePatch 0.1</span></div>
    </main>
    {busy && <div className="busy-pill" role="status"><LoaderCircle size={17} className="spin"/>Preparing your guide…</div>}
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-label={modal === 'privacy' ? 'Review text before analysis' : modal === 'settings' ? 'Connection settings' : 'How GuidePatch works'} onClick={e => e.stopPropagation()}><button className="modal-close" aria-label="Close dialog" onClick={() => setModal(null)}><X size={19}/></button>{modal === 'settings' ? <><span className="small-tag"><Radio size={14}/>MODEL CONNECTION</span><h2>One carefully bounded call.</h2><p>GuidePatch uses NVIDIA Nemotron through Nebius Token Factory. Credentials stay on the server.</p><dl><dt>Status</dt><dd>{status?.enabled ? 'Live alignment available' : 'Live alignment not enabled'}</dd><dt>Model</dt><dd>{status?.model ?? 'No service connection'}</dd><dt>Application budget</dt><dd>{status ? `$${Number(status.remainingUsd).toFixed(3)} remaining · ${status.phase ?? 'development'}` : 'Not configured'}</dd></dl><label htmlFor="access">Reviewer access code <small>Only if provided by the host. This is not a model API key.</small></label><input id="access" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}/><button className="secondary" onClick={() => getStatus().then(setStatus).catch(fail)}><RefreshCw size={15}/>Check connection</button></> : modal === 'privacy' ? <><span className="small-tag"><Sparkles size={14}/>SEMANTIC STEP ALIGNMENT</span><h2>Review what leaves this device.</h2><p>These descriptions, actions, labels and page paths go to Nebius. Screenshots and typed input values are excluded. Descriptions may still contain private details.</p><pre>{JSON.stringify({ oldSteps: workspace ? requestSteps(workspace.oldGuide) : [], newSteps: workspace ? requestSteps(workspace.newGuide) : [] }, null, 2)}</pre><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" onClick={runAI} disabled={!status?.enabled || busy}><Sparkles size={16}/>Send steps to Nemotron</button></div></> : <><span className="small-tag"><Layers2 size={14}/>THE FOUR-STEP WORKFLOW</span><h2>Good guides keep moving.</h2><ol className="help-steps"><li><strong>Record twice.</strong> Export the old and updated workflow as .mimik files from Mimik.</li><li><strong>Compare the evidence.</strong> Start with exact text matches, or ask Nemotron to align renamed steps.</li><li><strong>Decide what stays.</strong> Inspect both screenshots, edit wording, accept or keep original content. Choose the final ordering separately.</li><li><strong>Share the result.</strong> Export a standalone HTML walkthrough or a file you can edit again in Mimik.</li></ol><p>Recorded actions do not prove the task succeeded. Confirm the final outcome from the recording.</p><a href="https://github.com/westpoint-io/mimik" target="_blank" rel="noreferrer">Get the Mimik recorder <ExternalLink size={13}/></a></>}</section></div>}
  </div>;
}
