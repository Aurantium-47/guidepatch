import Dexie from 'dexie';
import type { Workspace } from '../domain';
import { validateAlignment } from './review';
import { withImageChanges } from './guide-files';

const db = new Dexie('GuidePatch');
db.version(1).stores({ workspaces: 'id' });

export async function saveWorkspace(workspace: Workspace) {
  await db.table('workspaces').put({ id: 'current', version: 1, workspace });
}

export async function loadWorkspace(): Promise<Workspace | null> {
  const record = await db.table('workspaces').get('current');
  if (!record) return null;
  if (record.version !== 1) throw new Error('This saved workspace uses an unsupported version. Import your guides again.');
  const workspace: Workspace = record.workspace;
  const normalized = await withImageChanges(validateAlignment(workspace.rows, workspace.oldGuide.steps, workspace.newGuide.steps), workspace.oldGuide, workspace.newGuide);
  return { ...workspace, rows: workspace.rows.map((row, i) => ({ ...row, ...normalized[i],
    kind: row.kind === 'changed' && normalized[i].kind === 'unchanged' ? 'changed' : normalized[i].kind,
    decision: row.kind === 'unchanged' && normalized[i].kind !== 'unchanged' ? 'pending' : row.decision,
  })) };
}
