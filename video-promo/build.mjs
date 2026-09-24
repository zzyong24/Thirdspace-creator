import {build} from 'esbuild';
import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import integration from './integration.config.mjs';
const require=createRequire(import.meta.url);
const plan=JSON.parse(await readFile('plan.json','utf8'));
const repoDir=integration.repoDir || plan.repo;
await mkdir('.build',{recursive:true});
await mkdir('dist',{recursive:true});
const result=await build({
  entryPoints:['src/film.jsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',
  outfile:'.build/film.cjs',metafile:true,
  // Bundle product dependencies; nodePaths alone cannot resolve external ESM imports at runtime.
  nodePaths:repoDir?[path.resolve(repoDir,'node_modules')]:[],
  alias:integration.aliases,
  // Share the video project's React runtime with all bundled product components.
  external:['react','react/*','react-dom','react-dom/*',...(integration.external || [])],
  loader:{'.css':'css','.module.css':'local-css','.png':'file','.jpg':'file','.svg':'file','.woff':'file','.woff2':'file',...integration.loaders},
  assetNames:'assets/[name]-[hash]',
});
await mkdir('evidence',{recursive:true});
await writeFile('evidence/component-imports.json',JSON.stringify(result.metafile,null,2));
const {renderFilm}=require(path.resolve('.build/film.cjs'));
let css=await readFile('src/layout.css','utf8');
for(const file of ['assets/fallback/tokens.css','.build/film.css','src/product.css']) {
  if(existsSync(file)) css+='\n'+await readFile(file,'utf8');
}
const timeline=await readFile('src/timeline.js','utf8');
const config=JSON.stringify({duration:plan.duration,fps:plan.fps}).replace(/</g,'\\u003c');
const markup=renderFilm(plan);
if(!plan.demo && markup.includes('data-skill-placeholder=')) throw new Error('Technical fixture is still on screen. Connect the actual product feature components before production.');
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Software update film</title><style>'+css+'</style>'+markup+'<script>window.FILM='+config+';</script><script>'+timeline+'</script></html>';
await writeFile('dist/index.html',html);
if(existsSync('public')) await cp('public','dist',{recursive:true});
if(existsSync('assets')) await cp('assets','dist/assets',{recursive:true});
// Preserve paths referenced by bundled CSS and imported image/font assets.
for(const file of Object.keys(result.metafile.outputs)) {
  if(/\.(?:cjs|css|map)$/.test(file)) continue;
  const destination=path.join('dist',path.relative('.build',file));
  await mkdir(path.dirname(destination),{recursive:true});
  await cp(file,destination);
}
console.log('Built dist/index.html; source imports recorded in evidence/component-imports.json');
