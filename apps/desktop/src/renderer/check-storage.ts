import './core-env';
import { db, MimikDB } from '@mimik/core/guides/db';
import {
  addStepToGuide,
  createGuide,
  createSnapshot,
  createStep,
  getGuide,
  permanentlyDeleteGuide,
  saveScreenshot,
} from '@mimik/core/guides/service';
import Dexie from 'dexie';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const MIGRATION_DB = 'mimik-migration-check';

async function migration(): Promise<CheckResult> {
  await Dexie.delete(MIGRATION_DB);

  const v1 = new Dexie(MIGRATION_DB);
  v1.version(1).stores({
    guides: 'id, createdAt, updatedAt, starred, deletedAt',
    steps: 'id, guideId, index',
    screenshots: 'id, stepId',
  });
  await v1.open();
  await v1.table('guides').add({ id: 'legacy', title: 'Written at v1', createdAt: 1, updatedAt: 1, stepIds: [] });
  v1.close();

  const upgraded = new MimikDB(MIGRATION_DB);
  await upgraded.open();
  const survivor = await upgraded.guides.get('legacy');
  const snapshotCount = await upgraded.snapshots.count();
  const verno = upgraded.verno;
  upgraded.close();
  await Dexie.delete(MIGRATION_DB);

  return {
    name: 'v1 to v2 migration',
    ok: verno === 2 && survivor?.title === 'Written at v1' && snapshotCount === 0,
    detail: `reopened at v${verno}, v1 row ${survivor ? 'survived' : 'lost'}, snapshots table readable`,
  };
}

async function open(): Promise<CheckResult> {
  await db.open();
  const tables = db.tables.map((t) => t.name).sort();
  const expected = ['guides', 'screenshots', 'snapshots', 'steps'];
  return {
    name: 'MimikDB opens',
    ok: db.verno === 2 && expected.every((t) => tables.includes(t)),
    detail: `v${db.verno}, tables: ${tables.join(', ')}`,
  };
}

async function write(guideId: string): Promise<CheckResult> {
  const stepId = `${guideId}-step`;
  const screenshotId = `${guideId}-shot`;

  await createGuide(guideId);
  await saveScreenshot({
    id: screenshotId,
    stepId,
    blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
    mimeType: 'image/png',
    width: 2,
    height: 2,
  });
  await createStep({
    id: stepId,
    guideId,
    index: 0,
    description: 'Click Save',
    action: 'click',
    url: '',
    app: { name: 'Mimik Desktop' },
    window: { title: 'Storage check' },
    timestamp: Date.now(),
    screenshotId,
  });
  await addStepToGuide(guideId, stepId);
  const snapshot = await createSnapshot(guideId);

  return {
    name: 'write through @mimik/core',
    ok: snapshot !== null,
    detail: snapshot
      ? `guide, step, screenshot and snapshot ${snapshot.id.slice(0, 8)} stored`
      : 'snapshot not created',
  };
}

async function read(guideId: string): Promise<CheckResult> {
  const found = await getGuide(guideId);
  const step = found?.steps[0];
  const shot = found ? found.screenshots.get(step?.id ?? '') : undefined;
  const blobBytes = shot ? (await shot.blob.arrayBuffer()).byteLength : 0;
  await permanentlyDeleteGuide(guideId);

  return {
    name: 'read from a second window',
    ok: Boolean(found) && step?.app?.name === 'Mimik Desktop' && blobBytes === 4,
    detail: found
      ? `${found.steps.length} step, app "${step?.app?.name}", screenshot blob ${blobBytes} bytes`
      : 'guide not found',
  };
}

async function run(): Promise<CheckResult[]> {
  const [role, guideId] = (window.location.hash.slice(1) || 'write:unknown').split(':');
  if (role === 'read') return [await read(guideId)];
  return [await migration(), await open(), await write(guideId)];
}

function report(results: CheckResult[]): void {
  console.log(`MIMIK_STORAGE_CHECK ${JSON.stringify(results)}`);
}

run()
  .then(report)
  .catch((error) =>
    report([{ name: 'storage check', ok: false, detail: error instanceof Error ? error.message : String(error) }]),
  );
