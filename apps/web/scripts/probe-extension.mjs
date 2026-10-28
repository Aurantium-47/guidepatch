import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const extension=fileURLToPath(new URL('../../extension/.output/chrome-mv3/',import.meta.url));
const profile=fileURLToPath(new URL(`../../../artifacts/extension-probe-${Date.now()}/`,import.meta.url));
await mkdir(profile,{recursive:true});
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:800}});
try{
  let worker=context.serviceWorkers()[0];
  if(!worker) worker=await context.waitForEvent('serviceworker',{timeout:20000});
  const id=new URL(worker.url()).hostname;
  console.log(JSON.stringify({extensionId:id,worker:worker.url()}));
  const page=await context.newPage();
  await page.goto(`chrome-extension://${id}/fullview.html`);
  console.log((await page.locator('body').innerText()).slice(0,6000));
}finally{await context.close();}
