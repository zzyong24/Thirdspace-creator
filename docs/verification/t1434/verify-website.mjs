import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(root, 'docs/verification/t1434');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const url = process.argv.includes('--local') ? 'http://127.0.0.1:8764/' : 'https://creatoros.aitongban.cloud/';
const script = `
const task = await taskSpace('CreatorOS 官网更新 T1434'), page = task.page('p1');
const fs = await import('node:fs/promises');
const captures = [], observations = [];
const ids = ['120-oct','120-sep','110','100','030','020','010'];
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  await page.goto(${JSON.stringify(url)} + '#changelog');
  await page.cdp('Emulation.setDeviceMetricsOverride', {...viewport, deviceScaleFactor:1, mobile:false});
  await page.waitForFunction(w=>innerWidth===w, viewport.width);
  await page.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.loading='eager'));
  await page.waitForFunction(()=>[...document.images].filter(i=>i.getAttribute('src')).every(i=>i.complete&&i.naturalWidth>0));
  const initial = await page.evaluate(()=>({download:!!document.querySelector('[download],#creatoros-manual-download-e315'), width:innerWidth,scrollWidth:document.documentElement.scrollWidth,version:document.querySelector('.release-copy strong').textContent,selected:document.querySelector('.release-tab[aria-selected="true"]').id}));
  if(initial.download || initial.scrollWidth>initial.width || initial.version!=='CreatorOS v1.2.0' || initial.selected!=='release-tab-120-oct') throw Error('官网初始状态不符合需求: '+JSON.stringify(initial));
  for (const id of ids) {
    await page.click('loc=css:#release-tab-'+id);
    const state = await page.evaluate(()=>({selected:[...document.querySelectorAll('.release-tab[aria-selected="true"]')].map(t=>t.id),panels:[...document.querySelectorAll('.release-panel:not([hidden])')].map(p=>p.id),text:document.querySelector('.release-panel:not([hidden])').innerText}));
    if(state.selected.length!==1 || state.selected[0]!=='release-tab-'+id || state.panels.length!==1 || state.panels[0]!=='release-'+id || !state.text.trim()) throw Error('版本切换失配 '+id);
    captures.push({checkpoint:'版本 '+id, check_ids:['download-removed','versions','keyboard-refresh','responsive'],viewport,text:state.text});
  }
  await page.click('loc=css:#release-tab-120-oct');
  await page.press('loc=css:#release-tab-120-oct','ArrowRight');
  if(await page.evaluate(()=>document.activeElement.id)!=='release-tab-120-sep') throw Error('方向键向右失败');
  await page.press('loc=css:#release-tab-120-sep','ArrowLeft');
  if(await page.evaluate(()=>document.activeElement.id)!=='release-tab-120-oct') throw Error('方向键向左失败');
  await page.waitForFunction(()=>[...document.querySelectorAll('.release-tab')].every(t=>t.getAnimations().length===0));
  await page.evaluate(()=>document.getElementById('changelog').scrollIntoView());
  await page.waitForFunction(()=>Math.abs(document.getElementById('changelog').getBoundingClientRect().top)<2);
  const shot = await page.cdp('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
  await fs.writeFile(${JSON.stringify(out)}+'/verified-'+viewport.width+'.png',Buffer.from(shot.data,'base64'));
  observations.push({viewport,initial,versions:ids.length,keyboard:true});
  await page.reload();
  if(await page.evaluate(()=>document.querySelector('.release-tab[aria-selected="true"]').id)!=='release-tab-120-oct') throw Error('刷新默认版本失配');
}
await fs.writeFile(${JSON.stringify(out)}+'/visible-copy.json',JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1434',commit_sha:${JSON.stringify(commit)},captures},null,2));
await fs.writeFile(${JSON.stringify(out)}+'/browser-observations.json',JSON.stringify({url:${JSON.stringify(url)},observedAt:new Date().toISOString(),observations},null,2));
console.log('官网真实浏览器检查通过：两个视口、7个版本批次、方向键与刷新。');
`;
const result = spawnSync('ego-browser', ['nodejs'], { cwd: root, input: script, encoding: 'utf8', maxBuffer: 1024*1024 });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
writeFileSync(resolve(out, 'browser-run.log'), output);
process.stdout.write(output);
if (result.status !== 0) process.exit(result.status || 1);
const hash = value => createHash('sha256').update(value).digest('hex');
const contract = readFileSync(resolve(root,'docs/features/t1434-website-changelog-refresh.md'),'utf8');
const checks = [
  {id:'download-removed',test_id:'website-public-content'},
  {id:'versions',test_id:'website-release-tabs'},
  {id:'keyboard-refresh',test_id:'website-keyboard-refresh'},
  {id:'responsive',test_id:'website-two-viewports'},
];
const evidence = 'docs/verification/t1434/browser-observations.json';
const report = {
  schema:'frontend-validation/v1',task_id:'T-1434',commit_sha:commit,contract_sha:hash(contract).slice(0,12),
  contract_path:'docs/features/t1434-website-changelog-refresh.md',observed_at:new Date().toISOString(),status:'pass',
  run:{verify_key:'website-t1434',command:'node docs/verification/t1434/verify-website.mjs',exit_code:0,output_ref:'docs/verification/t1434/browser-run.log'},
  environment:{surface:'browser',runtime:'Ego Lite Chromium，真实公开官网',viewports:[{width:1440,height:1000,result:'pass'},{width:390,height:844,result:'pass'}]},
  data:{mode:'non-fixture',witnesses:[{id:'release-120-oct',role:'十月真实更新'},{id:'release-120-sep',role:'九月真实更新'}]},
  levels:{logic:{status:'pass',evidence_ref:'docs/verification/t1434/website-tests.log'},surface:{status:'pass',evidence_ref:evidence},journey:{status:'pass',evidence_ref:evidence},experience:{status:'not-requested',evidence_ref:'机器浏览器检查，不冒充用户人工验收'}},
  checks:checks.map(c=>({...c,result:'pass',evidence_ref:evidence})),
  coverage:[{condition:'refresh',result:'pass',evidence_ref:evidence},{condition:'keyboard',result:'pass',evidence_ref:evidence}],
  tdd_red_ref:'纯静态文案与下载区移除不制造TDD红测；真实线上旧版缺少新批次并保留旧下载区的失败见 docs/verification/t1434/production-before.log',
  open_defects:[],visible_copy:{artifact_path:'docs/verification/t1434/visible-copy.json',artifact_sha256:hash(readFileSync(resolve(out,'visible-copy.json')))}
};
if(!process.argv.includes('--local')) writeFileSync(resolve(out,'frontend-report.json'),JSON.stringify(report,null,2)+'\n');
