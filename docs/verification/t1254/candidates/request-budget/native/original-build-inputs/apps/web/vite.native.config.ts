import {defineConfig,mergeConfig,parseSync} from 'vite'
import original from './vite.config'
import path from 'node:path'
import {readFileSync,existsSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const web=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(web,'../..')
const exports={core:{'':'index','renderer':'renderer/index','extensions':'extensions/index','utils':'utils/index','utils/mathjax':'utils/mathjax','theme':'theme/index','theme/cssVariables':'theme/cssVariables','native-host':'native-host'},shared:{'':'index','configs':'configs/index','constants':'constants/index','types':'types/index','utils':'utils/index','editor':'editor/index'}}
export default defineConfig(async env=>{
 const base=typeof original==='function'?await original(env):original
 return mergeConfig(base,{mode:'production',define:{'process.env.NODE_ENV':JSON.stringify('production')},base:'/reference-editors/doocs-md/native/',resolve:{alias:[...Object.entries(exports).flatMap(([pkg,parts])=>Object.entries(parts).map(([key,value])=>({find:new RegExp(`^@md/${pkg}${key?'/'+key:''}$`),replacement:path.join(root,`packages/${pkg}/src/${value}.ts`)}))),{find:/^@md\/shared\/(utils|editor|configs|types|constants)\/(.+)$/,replacement:path.join(root,'packages/shared/src/$1/$2.ts')},{find:'@',replacement:path.join(web,'src')}]},build:{outDir:'dist-native',emptyOutDir:true,lib:{entry:path.join(web,'src/native-entry.ts'),formats:['es'],fileName:()=> 'native.js',cssFileName:'native'},rolldownOptions:{output:{entryFileNames:'native.js',chunkFileNames:'chunks/[name]-[hash].js',assetFileNames:asset=>asset.names?.some(name=>name.endsWith('.css'))?'native.css':'[name]-[hash][extname]'}}},plugins:[{name:'creatoros-native-style-tokens',enforce:'post',renderChunk(code,chunk){
 // 在块哈希前只剔除真实注释；字符串中的同样文字不能被改写。
 const parsed=parseSync(chunk.fileName,code)
 if(parsed.errors.length)throw new Error('原生构建块解析失败：'+chunk.fileName)
 const regions=parsed.comments.filter(comment=>comment.type==='Line'&&/^#(?:end)?region(?: |$)/.test(comment.value))
 let output=code
 for(const comment of regions.reverse())output=output.slice(0,comment.start)+output.slice(comment.end)
 return {code:output,map:null}
 },generateBundle(_options,bundle){
 const modules=[...new Set(Object.values(bundle).filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules)))].sort()
 const dependencies=new Map()
 for(const id of modules){if(!id.includes('node_modules'))continue;let directory=path.dirname(id.split('?')[0]);while(directory!==path.dirname(directory)){const filename=path.join(directory,'package.json');if(existsSync(filename)){try{const pkg=JSON.parse(readFileSync(filename,'utf8'));if(pkg.name&&pkg.version){const key=pkg.name+'@'+pkg.version;if(!dependencies.has(key)){const licenses=readdirSync(directory).filter(name=>/^(licen[cs]e|copying|notice)(?:[.-]|$)/i.test(name)).sort();const delivered=[];for(const name of licenses){try{const content=readFileSync(path.join(directory,name),'utf8');const fileName='licenses/'+pkg.name.replace(/[\/@]/g,'_')+'-'+pkg.version+'-'+name;this.emitFile({type:'asset',fileName,source:content});delivered.push(fileName)}catch{}}dependencies.set(key,{name:pkg.name,version:pkg.version,license:pkg.license??null,licenseFiles:delivered})}break}}catch{}}directory=path.dirname(directory)}}
 this.emitFile({type:'asset',fileName:'native-build-graph.json',source:JSON.stringify({upstreamCommit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',format:'ESM',entry:'native.js',css:'native.css',modules:modules.map(id=>id.includes('node_modules')?id.replace(/.*node_modules\//,'node_modules/'):id.startsWith(root)?path.relative(root,id):id).sort(),dependencies:[...dependencies.values()].sort((a,b)=>(a.name+'@'+a.version)<(b.name+'@'+b.version)?-1:(a.name+'@'+a.version)>(b.name+'@'+b.version)?1:0)},null,2)+'\n'})
 for(const output of Object.values(bundle))if(output.type==='asset'&&output.fileName.endsWith('.css'))output.source=String(output.source).replace(/hsl\(var\((--[\w-]+)\)(?:\s*\/\s*[^)]+)?\)/g,(_all,key)=>`var(${key})`)}}]})
})
