// 本适配器的可重建源码；noterelay-layout.ts 由 CreatorOS contract 原文件复制生成。
import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'dist');await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(here,'native.ts')],outfile:path.join(out,'native.js'),bundle:true,format:'esm',target:'es2022',minify:true,nodePaths:[path.join(here,'node_modules')],alias:{obsidian:path.join(here,'obsidian.ts')},legalComments:'eof'});
await writeFile(path.join(out,'native.css'), (await readFile(path.join(here,'../styles.css'),'utf8'))+'\n'+(await readFile(path.join(here,'native.css'),'utf8')));
