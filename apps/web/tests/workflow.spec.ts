import { test, expect } from '@playwright/test';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { readFile } from 'node:fs/promises';

async function sample(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the invitation workflow' }).click();
  await expect(page.getByText('Local exact-match comparison', { exact: true })).toBeVisible();
  await expect(page.locator('.change-row')).toHaveCount(10);
}

test('F1 reviews actual screenshot bundles, reimports Mimik and inspects standalone HTML', async ({ page, browser }, info) => {
  await sample(page);
  await page.locator('[data-old-id="old-invite"][data-new-id=""]').click();
  await page.locator('#pair').selectOption({ label: 'Click Add member.' });
  await page.getByRole('button', { name: 'Match steps', exact: true }).click();
  await expect(page.locator('.change-row')).toHaveCount(9);
  await expect(page.locator('[data-old-id="old-open"]').locator('small')).toHaveText('changed');
  await page.locator('[data-old-id="old-send"][data-new-id=""]').click();
  await page.locator('#pair').selectOption({ label: 'Click Review invitation.' });
  await page.getByRole('button', { name: 'Match steps', exact: true }).click();
  await expect(page.locator('.change-row')).toHaveCount(8);
  await page.locator('[data-old-id="old-invite"][data-new-id="new-invite"]').click();
  await expect(page.locator('#wording')).toHaveValue(/never assign Owner to a guest/);
  const keptWording=await page.locator('#wording').inputValue();
  await page.locator('#wording').fill(keptWording.replace('Click Invite member.', 'Click Add member.'));
  await page.screenshot({ path: info.outputPath('review-desktop.png'), fullPage: true });
  const rows = page.locator('.change-row');
  for (let i = 0; i < await rows.count(); i++) {
    await rows.nth(i).click();
    if (await rows.nth(i).getAttribute('data-old-id') === 'old-editor-note') await page.getByRole('button', { name: 'Keep original', exact: true }).click();
    else await page.getByRole('button', { name: /^Accept (update|removal)$/ }).click();
  }
  await expect(page.getByText('All changes reviewed', { exact: true })).toBeVisible();
  const bundleEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Mimik file', exact: true }).click();
  const bundle = await bundleEvent;
  const bundlePath = info.outputPath('reviewed.mimik');
  await bundle.saveAs(bundlePath);
  const entries = unzipSync(new Uint8Array(await readFile(bundlePath)));
  const manifest = JSON.parse(strFromU8(entries['manifest.json']));
  expect(manifest.steps).toHaveLength(8);
  expect(manifest.screenshots).toHaveLength(7);
  for (const shot of manifest.screenshots) expect(entries[shot.file]).toBeTruthy();
  expect(new Set(manifest.steps.map((s: { id: string }) => s.id)).size).toBe(8);
  expect(manifest.guide.title).toBe('North Studio · Member onboarding');
  expect(manifest.steps.some((s: { description: string }) => s.description.includes('not a client workspace'))).toBe(true);
  expect(manifest.steps.some((s: { description: string }) => s.description.includes('Click Add member. Confirm the current workspace; never assign Owner'))).toBe(true);
  const htmlEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export walkthrough', exact: true }).click();
  const htmlPath = info.outputPath('walkthrough.html');
  await (await htmlEvent).saveAs(htmlPath);
  const html = await readFile(htmlPath, 'utf8');
  expect(html).toContain('aria-label="Walkthrough playback"');
  expect(html).toContain('id="gp-next"');
  expect(html).toContain('never assign Owner');
  expect(html).toContain('not a client workspace');
  expect((html.match(/data:image\/webp;base64/g) ?? []).length).toBeGreaterThanOrEqual(7);
  await page.getByRole('button', { name: 'Preview guide', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.playbar')).toContainText('02');
  const fresh = await browser.newContext();
  const reopened = await fresh.newPage();
  await reopened.goto('http://127.0.0.1:4318/');
  await reopened.getByLabel('Original guide file').setInputFiles(bundlePath);
  await expect(reopened.locator('.file-card').first()).toContainText('8 steps');
  await fresh.close();
});

test('F3 imports and exports hostile-looking text as text without executing it', async ({ page }, info) => {
  const text='<script>window.__guidepatchShouldNotRun=true</script>';
  const m={version:1,guide:{title:'Text escaping check',createdAt:1},steps:[{id:'same',index:0,description:text,action:'note',url:'javascript:alert(1)',timestamp:1}],screenshots:[]};
  const buffer=Buffer.from(zipSync({'manifest.json':strToU8(JSON.stringify(m))}));
  await page.goto('/');
  await page.getByLabel('Original guide file').setInputFiles({name:'original.mimik',mimeType:'application/zip',buffer});
  await page.getByLabel('Updated guide file').setInputFiles({name:'updated.mimik',mimeType:'application/zip',buffer});
  await page.getByRole('button',{name:'Compare guides',exact:true}).click();
  expect(await page.evaluate(()=>Object.hasOwn(window,'__guidepatchShouldNotRun'))).toBe(false);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export walkthrough',exact:true}).click();
  const htmlPath=info.outputPath('escaped.html');await(await download).saveAs(htmlPath);
  const html=await readFile(htmlPath,'utf8');
  expect(html).toContain('&lt;script&gt;window.__guidepatchShouldNotRun=true&lt;/script&gt;');
  expect(html).not.toContain('<script>window.__guidepatchShouldNotRun');
  expect(html).not.toContain('href="javascript:');
});

test('F3 keeps review decisions across undo, reload and failed re-analysis', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { provider: 'nebius', configured: true, enabled: true, model: 'test-provider-only', remainingUsd: 1, budgetUsd: 1 } }));
  await page.route('**/api/align', route => route.fulfill({ status: 502, json: { error: 'provider_unavailable' } }));
  page.on('dialog', dialog => dialog.accept());
  await sample(page);
  const first = page.locator('.change-row').first();
  await first.click();
  await page.getByRole('button', { name: 'Accept update', exact: true }).click();
  await expect(page.locator('.decision-label')).toHaveText('Update accepted');
  await page.getByRole('button', { name: 'Keep original', exact: true }).click();
  await expect(page.locator('.decision-label')).toHaveText('Original kept');
  await page.getByRole('button', { name: 'Undo last review action' }).click();
  await expect(page.locator('.decision-label')).toHaveText('Update accepted');
  await expect(page.getByText('Saved in this browser', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Restored your last review from this browser.')).toBeVisible();
  await expect(page.locator('.change-row').first()).toHaveAttribute('data-decision', 'accept');
  await page.getByRole('button', { name: 'Align with Nemotron' }).click();
  await expect(page.getByRole('dialog', { name: 'Review text before analysis' })).toBeVisible();
  await page.getByRole('button', { name: 'Send steps to Nemotron' }).click();
  await expect(page.getByRole('alert')).toContainText('unchanged');
  await expect(page.locator('.change-row').first()).toHaveAttribute('data-decision', 'accept');
  await expect(page.getByText('Local exact-match comparison', { exact: true })).toBeVisible();
});

test('F3 rejects damaged and duplicate-ID inputs without replacing the current review', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await sample(page);
  const manifest = { version: 1, guide: { title: 'Invalid duplicate IDs' }, steps: [{ id: 'same', description: 'One', action: 'click' }, { id: 'same', description: 'Two', action: 'click' }], screenshots: [] };
  await page.getByLabel('Original guide file').setInputFiles({ name: 'duplicate.mimik', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) })) });
  await expect(page.getByRole('alert')).toContainText('duplicate step IDs');
  await expect(page.locator('.change-row')).toHaveCount(10);
  await page.getByLabel('Original guide file').setInputFiles({ name: 'broken.mimik', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.change-row')).toHaveCount(10);
});

test('F3 mobile layout remains within the viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sample(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('review-mobile.png'), fullPage: true });
});
