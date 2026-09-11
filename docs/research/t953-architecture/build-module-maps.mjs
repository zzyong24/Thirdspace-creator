import fs from 'node:fs';
const dir='docs/research/t953-architecture',data=JSON.parse(fs.readFileSync(dir+'/dependencies.json'));
const titles={'ai':'AI 业务任务','ai-runtime':'任务准备与宿主执行','execution':'持久执行内核','artifacts':'稿件与版本','assets':'素材','benchmark':'对标','favorites':'收藏','intelligence':'内容雷达','projects':'项目','review':'审核','search':'搜索','settings':'设置'};
const maps=[];
for(const mod of data.modules){const edges=data.edges.filter(e=>e.from===mod.id);if(!edges.length)continue;
 for(let start=0;start<edges.length;start+=4){const part=edges.slice(start,start+4),key=mod.id+'-'+(start/4+1),h=Math.max(440,part.length*150),rootY=(h-76)/2;
 const s={schema_version:1,diagram_type:'architecture',meta:{title:`${mod.id} · 模块依赖 ${start/4+1}`,locale:'zh-CN',quality_profile:'showcase',repository:{url:'https://github.com/zzyong24/Thirdspace-creator',revision:data.revision,link_mode:'local-only'}},components:[{id:mod.id,type:'backend',label:mod.id,sublabel:titles[mod.id]??'业务模块',pos:[60,part.length===4?185:rootY],size:[240,76],sources:[{path:'backend/src/modules/'+mod.id+'/index.ts'}]},...part.map((e,i)=>({id:e.to,type:'backend',label:e.to,sublabel:titles[e.to]??'业务模块',pos:[part.length===4?880:590,40+i*(part.length===4?105:150)],size:[240,76],sources:[{path:e.evidence[0].file,line:e.evidence[0].line}]}))],connections:part.map(e=>({id:e.from+'-to-'+e.to,from:e.from,to:e.to})),cards:[{dot:'cyan',title:'箭头含义：源码引用',items:['方向为引用方 → 被引用模块；包含类型引用','线段不重复标注同一含义；证据见节点与依赖清单']},{dot:'amber',title:'范围',items:[`本页 ${part.length} / ${edges.length} 个直接依赖`,'端口注入与运行时动态调用不计入静态导入']} ]};
 fs.writeFileSync(dir+'/'+key+'.json',JSON.stringify(s,null,2));maps.push({key,module:mod.id,targets:part.map(e=>e.to)});
 }}
const leaves=data.modules.filter(m=>!data.edges.some(e=>e.from===m.id));
for(let start=0;start<leaves.length;start+=8){
 const nodes=leaves.slice(start,start+8),key='independent-'+(start/8+1);
 const spec={schema_version:1,diagram_type:'architecture',meta:{title:'业务模块 · 无直接跨模块导入 '+(start/8+1),locale:'zh-CN',quality_profile:'showcase'},components:nodes.map((m,i)=>({id:m.id,type:'backend',label:m.id,sublabel:m.sourceFiles+' 个非测试源码文件',pos:[60+(i%3)*370,40+Math.floor(i/3)*140],size:[280,80]})),cards:[{dot:'cyan',title:'无连线的含义',items:['这些模块未检测到对其他业务模块的直接导入','仍可引用 contract、数据库基座和外部库']},{dot:'amber',title:'由应用层组合',items:['没有静态跨模块引用，不等于没有业务协作','注入端口、调用方和源码清单在目录中查看']}]};
 fs.writeFileSync(dir+'/'+key+'.json',JSON.stringify(spec,null,2));maps.push({key,module:null,members:nodes.map(m=>m.id),targets:[]});
}
fs.writeFileSync(dir+'/maps.json' ,JSON.stringify(maps,null,2));console.log(maps.length);
