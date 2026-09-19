// Optional real build/browser regression. Uses installed dependencies; no downloads.
// node tests/integration.mjs --modules /absolute/video/node_modules [--python python3]
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const modules=option('--modules');
if(!modules) throw Error('Pass --modules pointing to an installed starter node_modules; this test never installs packages.');
const dependencies=createRequire(path.join(path.resolve(modules),'integration.cjs'));
const packages=['esbuild','react','react-dom','playwright'];
const paths=Object.fromEntries(packages.map(name=>[name,path.dirname(dependencies.resolve(name+'/package.json'))]));
const {chromium}=dependencies('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=await mkdtemp(path.join(tmpdir(),'software-video-integration-'));
let browser,server;
try {
  const repo=path.join(workspace,'product'),video=path.join(workspace,'video');
  await mkdir(path.join(repo,'src/components'),{recursive:true});
  await mkdir(path.join(repo,'node_modules/fake-icons'),{recursive:true});
  await writeFile(path.join(repo,'node_modules/fake-icons/package.json'),JSON.stringify({name:'fake-icons',main:'index.js'}));
  await writeFile(path.join(repo,'node_modules/fake-icons/index.js'),'exports.label="Repository-only dependency";');
  await writeFile(path.join(repo,'src/components/Selector.jsx'),`import React from 'react';import {label} from 'fake-icons';import './selector.css';
export function Selector(){return <div className="moving" data-enter="0.2"><h2>{label}</h2><div className="moving" data-enter="0.5">Nested entrance</div><span className="original-animation">Product animation</span></div>}`);
  await writeFile(path.join(repo,'src/components/selector.css'),`.moving{transition:opacity 2s,transform 2s;animation:original 2s infinite;background-image:url('./mark.svg')}.original-animation{animation:original 2s infinite;transition:opacity .7s}.moving h2{font-size:17px}@keyframes original{to{opacity:.5}}`);
  await writeFile(path.join(repo,'src/components/mark.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>');
  execFileSync(option('--python','python3'),[path.join(root,'scripts/init_project.py'),'--output',video,'--style','repo','--repo',repo],{stdio:'pipe'});
  await mkdir(path.join(video,'node_modules'));
  for(const name of packages) await symlink(paths[name],path.join(video,'node_modules',name),process.platform==='win32'?'junction':'dir');
  await writeFile(path.join(video,'integration.config.mjs'),'export default '+JSON.stringify({repoDir:repo,aliases:{'@':path.join(repo,'src')},external:[],loaders:{}}));
  await writeFile(path.join(video,'src/presentations.jsx'),"export {Selector as FeatureVisual} from '@/components/Selector.jsx';");
  execFileSync(process.execPath,['build.mjs'],{cwd:video,stdio:'pipe'});
  const markup=await readFile(path.join(video,'dist/index.html'),'utf8');
  assert.ok(markup.includes('Repository-only dependency'),'repository dependency must render');
  const graph=JSON.parse(await readFile(path.join(video,'evidence/component-imports.json'),'utf8'));
  assert.ok(Object.keys(graph.inputs).some(k=>k.includes('fake-icons/index.js')));
  assert.ok((await readdir(path.join(video,'dist/assets'))).some(n=>/^mark-.*\.svg$/.test(n)));
  const {serve}=await import(pathToFileURL(path.join(video,'server.mjs')).href);
  const oldCwd=process.cwd();process.chdir(video);
  let serving;try{serving=await serve();}finally{process.chdir(oldCwd)}
  server=serving.server;
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`)});
  await page.goto(serving.url,{waitUntil:'networkidle'});
  const snapshot=await page.evaluate(()=>{
    seek(4);
    const target=document.querySelector('.moving');
    const before=getComputedStyle(target).opacity;
    seek(3.1);
    const hidden=getComputedStyle(target).opacity;
    seek(4);
    return {
      driven:[...document.querySelectorAll('[data-enter]')].map(el=>({transition:getComputedStyle(el).transitionDuration,animation:getComputedStyle(el).animationName})),
      before,hidden,restored:getComputedStyle(target).opacity,
      childAnimation:getComputedStyle(document.querySelector('.original-animation')).animationName,
      childTransition:getComputedStyle(document.querySelector('.original-animation')).transitionDuration,
      heading:getComputedStyle(document.querySelector('.moving h2')).fontSize,
    };
  });
  for(const state of snapshot.driven){assert.equal(state.transition,'0s','data-enter must seek without transitional frames');assert.equal(state.animation,'none');}
  assert.equal(snapshot.hidden,'0');assert.equal(snapshot.before,'1');assert.equal(snapshot.restored,'1');
  assert.equal(snapshot.childAnimation,'original');assert.equal(snapshot.childTransition,'0.7s');assert.equal(snapshot.heading,'17px');
  assert.deepEqual(failures,[]);
  console.log('PASS: repo-only dependency, alias, CSS/assets, immediate forward/back seek, and preserved child animation.');
} finally {
  await browser?.close();
  if(server) await new Promise(resolve=>server.close(resolve));
  await rm(workspace,{recursive:true,force:true});
}
