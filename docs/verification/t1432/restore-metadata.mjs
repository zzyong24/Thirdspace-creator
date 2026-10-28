import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {parseBacklogTaskRows} from '../../../orchestrator/process/backlog-task-metadata.mjs';
import {acquireStateLock} from '../../../orchestrator/process/state-lock.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const root=process.cwd(),src=fs.readFileSync('BACKLOG.md','utf8'),sourceIndex=JSON.parse(fs.readFileSync('docs/verification/t1432/historical-id-provenance.json','utf8'));
const {lines,tasks}=parseBacklogTaskRows(src),sources=new Map(sourceIndex.migration_sources.map(s=>[s.id,s])),byLine=new Map(tasks.map(t=>[t.lineIndex,t]));
const changes=[];const signatures=[];const after=[];
const header='|ID|任务|状态|审核|验收|文档|一句话|',separator='|---|---|---|---|---|---|---|';
const next=lines.map((line,i)=>{
 const t=byLine.get(i);if(!t){if(/^\|\s*ID\s*\|/.test(line))return header;if(/^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line))return separator;return line;}
 signatures.push([t.id,t.status,t.review,t.acceptance]);let title=t.title,document=t.document,narrative=t.narrative;
 const source=sources.get(t.id);
 if(source){
  const file=path.resolve(root,source.source_file);if(!file.startsWith(root+path.sep))throw new Error('来源越界');
  const raw=fs.readFileSync(file,'utf8').split('\n')[source.source_line-1];if(sha(raw)!==source.source_sha256)throw new Error('来源变化：'+t.id);
  const cells=raw.split(/(?<!\\)\|/).slice(1,-1).map(c=>c.trim()),indices=source.metadata_column_indices;
  if(cells[indices.id]!==t.id)throw new Error('禁止改任务ID：'+t.id);
  title=cells[indices.title];
  document=cells[indices.documents]??'—';
  // 按已核实来源映射把相对原文件的路径规范到仓根；外仓引用只保全，不读取。
  for(const reference of source.original_document_references??[]) {
    if(!reference.repository_reference)continue;
    let target=reference.repository_reference;
    if(target.startsWith('../'))target=path.resolve(root,target);
    if(reference.href!==target)document=document.split(']('+reference.href+')').join(']('+target+')');
  }
  const originalHeader=source.source_header?.replace(/^\s*\||\|\s*$/g,'').split('|').map(x=>x.trim())??[];
  const narrativeColumn=originalHeader.length ? originalHeader.findIndex(x=>/一句话|描述|说明|恢复条件|暂停原因/.test(x)) : (source.source_column_count===5 ? 4 : -1);
  if(!narrative||/^(?:—|\[D\]|见详情。|完整任务范围.*)$/.test(narrative))narrative=narrativeColumn>=0?(cells[narrativeColumn]??''):narrative;
  changes.push({id:t.id,before_row:t.line,before_row_sha256:sha(t.line),source_file:source.source_file,source_line:source.source_line,source_sha256:source.source_sha256,source_header:source.source_header,metadata_column_indices:indices,title_changed:t.title!==title,limitations:source.limitations??source.source_limitations??null});
 }
 if(!title)throw new Error('没有可保全标题：'+t.id);
 const expanded=`|${[t.id,title,t.status,t.review||'—',t.acceptance??'—',document||'—',narrative||'—'].join('|')}|`;
 after.push([t.id,t.status,t.review,t.acceptance]);
 if(source)changes.at(-1).mechanically_expanded_row=expanded;
 return expanded;
}).join('\n');
if(JSON.stringify(signatures)!==JSON.stringify(after))throw new Error('状态/审核/验收不可变化');
const parsed=parseBacklogTaskRows(next);if(parsed.tasks.length!==tasks.length)throw new Error('任务漏项');
console.log(JSON.stringify({rows:tasks.length,restored:changes.length,expanded_bytes:Buffer.byteLength(next),before_sha256:sha(src),after_sha256:sha(next)}));
if(process.argv.includes('--apply')){
 const release=acquireStateLock(root,{operation:'t1432-restore-task-metadata'});
 try{if(fs.readFileSync('BACKLOG.md','utf8')!==src)throw new Error('并发变化');
 fs.writeFileSync('docs/verification/t1432/metadata-restoration.json',JSON.stringify({before_sha256:sha(src),after_sha256:sha(next),state_receipts_preserved:signatures,restorations:changes},null,2)+'\n');
 fs.writeFileSync('docs/verification/t1432/expanded-before-index.md',next);
 fs.writeFileSync('BACKLOG.md',next);
 }finally{release();}
}
