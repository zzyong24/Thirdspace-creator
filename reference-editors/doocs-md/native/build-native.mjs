import {spawnSync} from 'node:child_process'
import {cpSync,mkdirSync,readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const web=path.join(root,'apps/web')
function run(program,args,cwd=web){const result=spawnSync(program,args,{cwd,stdio:'inherit'});if(result.status!==0)throw new Error(`${program} ${args.join(' ')} failed (${result.status})`)}
run(path.join(web,'node_modules/.bin/vue-tsc'),['--project','tsconfig.app.json','--noEmit'])
run(path.join(web,'node_modules/.bin/vite'),['build','--config','vite.native.config.ts','--mode','production'])
const output=path.join(web,'dist-native')
cpSync(path.join(root,'LICENSE'),path.join(output,'LICENSE'))
const hashes={}
function scan(directory){for(const name of readdirSync(directory).sort()){const file=path.join(directory,name);if(statSync(file).isDirectory())scan(file);else if(name!=='SHA256.json')hashes[path.relative(output,file)]=createHash('sha256').update(readFileSync(file)).digest('hex')}}
scan(output)
writeFileSync(path.join(output,'SHA256.json'),JSON.stringify({upstream:{repository:'https://github.com/doocs/md',commit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',license:'WTFPL'},entry:'native.js',css:'native.css',files:hashes},null,2)+'\n')
if(process.argv[2]){const target=path.resolve(process.argv[2]);mkdirSync(target,{recursive:true});cpSync(output,target,{recursive:true})}
console.log(`Doocs 原生ESM构建完成：${output}`)
