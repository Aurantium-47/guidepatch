import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';

test('F0 opens a genuine Mimik v1 archive through the upstream parser', async ({ page }) => {
  await page.goto('/');
  const manifest = { version: 1, guide: { title: 'Synthetic spine guide', createdAt: 1 }, redacted: {}, steps: [{ id: 's1', description: 'Open workspace settings', action: 'click', url: 'https://example.test/settings', timestamp: 1 }], screenshots: [] };
  const buffer = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) }));
  await page.getByLabel('Original guide file').setInputFiles({ name: 'spine.mimik', mimeType: 'application/zip', buffer });
  await expect(page.locator('.file-card').first()).toContainText('Synthetic spine guide');
  await page.getByLabel('Updated guide file').setInputFiles({ name: 'updated.mimik', mimeType: 'application/zip', buffer });
  await page.getByRole('button', { name: 'Compare guides', exact: true }).click();
  await expect(page.getByText('Open workspace settings', { exact: true }).first()).toBeVisible();
});
