import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {piRuntimeInitializationPlugin} from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/ai-worker/scripts/pi-runtime-bundle.mjs';
const dir='/tmp/t1062-asr-timing-observation',root='/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator';
const require=createRequire(root+'/ai-worker/package.json'),{build}=require('esbuild');
// /tmp-only read-through dependency link; source dependency tree is never mutated.
try{await fs.symlink(root+'/ai-worker/node_modules',dir+'/node_modules');}catch(error){if(error.code!=='EEXIST')throw error;}
for(const name of ['observe','verify'])await build({entryPoints:[path.join(dir,name+'.mjs')],outfile:path.join(dir,name+'.cjs'),bundle:true,platform:'node',target:'node24',format:'cjs',plugins:[piRuntimeInitializationPlugin()],external:['@xenova/transformers'],logLevel:'warning'});
console.log('built two /tmp-only scripts; no application/model invocation');
