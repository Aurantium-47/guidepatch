import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { fileURLToPath } from 'node:url';

const out=fileURLToPath(new URL('../public/demo/',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
for(const version of ['old','new']){
  const page=await browser.newPage({viewport:{width:1200,height:760},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:4318/demo-app.html?v=${version}`);
  const steps=[],screenshots=[],files={};
  async function capture(id,description,action,label,selector){
    const target=selector?page.locator(selector):null;
    const rect=target?await target.boundingBox():null;
    const fullId=`${version}-${id}`;
    steps.push({id:fullId,index:steps.length,description,action,url:'https://fieldwork.example.test/members',timestamp:Date.now(),descriptionSource:'heuristic',...(target?{elementMeta:{tag:'button',cssSelector:selector,textContent:label,ariaLabel:label,placeholder:null,altText:null,name:null,role:'button',rect:rect??{x:0,y:0,width:0,height:0},devicePixelRatio:1,dataTestId:id}}:{})});
    const file=`screenshots/${fullId}.png`;
    files[file]=[new Uint8Array(await page.screenshot()),{level:0}];
    screenshots.push({id:`shot-${fullId}`,stepId:fullId,file,mimeType:'image/png',width:1200,height:760,...(rect?{bounds:rect}:{}),pixelRatio:1});
  }
  await capture('open',version==='old'?'Open the Members page.':'Open the Members page.','navigate','Members');
  if(version==='old') steps.push({id:'old-editor-note',index:steps.length,description:'Before inviting anyone, confirm that you are in North Studio, not a client workspace. This playbook note must stay when the interface changes.',action:'note',url:'https://fieldwork.example.test/members',timestamp:Date.now(),descriptionSource:'manual',blockType:'callout',calloutVariant:'warning'});
  await capture('invite',version==='old'?'Click Invite member.':'Click Add member.','click',version==='old'?'Invite member':'Add member','#invite');
  if(version==='old') { steps.at(-1).description='Click Invite member. Confirm the current workspace; never assign Owner to a guest.'; steps.at(-1).descriptionSource='manual'; }
  await page.locator('#invite').click();
  await capture('email','Enter the teammate’s email address.','input','Email address','#email');
  await page.locator('#email').fill('teammate@example.test');
  if(version==='new'){
    await capture('role','Choose Editor as the workspace role.','select','Workspace role','#role');
    await page.locator('#role').selectOption('Editor');
  }
  await capture('send',version==='old'?'Click Send invite.':'Click Review invitation.','click',version==='old'?'Send invite':'Review invitation','#send');
  await page.locator('#send').click();
  if(version==='new'){
    await capture('confirm','Review the role and click Confirm & send.','click','Confirm & send','#confirm');
    await page.locator('#confirm').click();
  }
  await capture('success','Check that Invitation sent is displayed.','note','Invitation sent');
  const manifest={version:1,exportedAt:Date.now(),guide:{title:version==='old'?'North Studio · Member onboarding':'Invite a teammate to Fieldwork',description:`Owned demo application. ${version==='old'?'An edited team playbook with a manually authored caution.':'Newly recorded workflow.'} Synthetic names, actual browser screenshots.`,createdAt:Date.now()},sourceDomain:'fieldwork.example.test',redacted:{screenshots:false,inputValues:true,urls:'path'},steps,screenshots};
  files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));
  files['README.md']=strToU8('# GuidePatch demonstration\nOwned fixture application, synthetic data, actual Edge screenshots. Assembled in the Mimik v1 format; not an extension capture.');
  await writeFile(`${out}${version}.mimik`,zipSync(files));
  await writeFile(`${out}${version}-manifest.json`,JSON.stringify(manifest,null,2));
  console.log(`${version}: ${steps.length} steps, ${screenshots.length} real browser screenshots`);
  await page.close();
}
await browser.close();
