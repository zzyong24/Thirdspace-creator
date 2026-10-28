import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseBacklogTaskRows} from '../../../orchestrator/process/backlog-task-metadata.mjs';
import {acquireStateLock} from '../../../orchestrator/process/state-lock.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const root=process.cwd(), src=fs.readFileSync('BACKLOG.md','utf8'),details=fs.readFileSync('BACKLOG-details.md','utf8'),archive=fs.readFileSync('BACKLOG-archive.md','utf8');
const {lines,tasks}=parseBacklogTaskRows(src), seen=new Map(), removed=[],additions=[];
for(const task of tasks){
 const first=seen.get(task.id);
 const archived=archive.split('\n').filter(line=>line.startsWith('|')&&line.split('|')[1]?.trim()===task.id);
 if(first||archived.length){
  if(archived.length&&!archived.includes(task.line))throw new Error('非相同活动/归档行：'+task.id);
  if(first && task.id!=='T-1397')for(const key of ['title','status','review','acceptance'])if(first[key]!==task[key])throw new Error('不同当前状态不得机械去重：'+task.id+' '+key);
  if(task.id==='T-1397'&&!first.status.startsWith('⏸'))throw new Error('T1397必须沿最后block事件保留暂停');
  const already=details.split('\n').includes(task.line)||archived.includes(task.line);
  if(!already)additions.push(`\n<a id="preserved-${sha(task.line).slice(0,16)}"></a>\n原始表头：${task.header.join(' | ')}\n\n${task.line}\n`);
  removed.push({id:task.id,line:task.lineIndex+1,source_sha256:sha(task.line),raw_row:task.line,kind:first?'duplicate':'exact-archived-copy',already_preserved:already});
 }else seen.set(task.id,task);
}
const gone=new Set(removed.map(x=>x.line-1)),next=lines.filter((_,i)=>!gone.has(i)).join('\n').replace('恢复必须使用 `taskctl start`','恢复必须使用 `taskctl resume <T-id> --reason "恢复依据"`');
const report={before_sha256:sha(src),after_sha256:sha(next),before_rows:tasks.length,after_rows:seen.size,removed,added_original_rows:additions.length};
console.log(JSON.stringify({before_rows:tasks.length,after_rows:seen.size,removed:removed.length,added_original_rows:additions.length,bytes_after:Buffer.byteLength(next)}));
if(process.argv.includes('--apply')){
 const release=acquireStateLock(root,{operation:'t1432-preserve-deduplicate'});
 try{
  if(fs.readFileSync('BACKLOG.md','utf8')!==src||fs.readFileSync('BACKLOG-details.md','utf8')!==details)throw new Error('并发变化');
  fs.writeFileSync('docs/verification/t1432/deduplication.json',JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync('BACKLOG-details.md',details+additions.join(''));
  fs.writeFileSync('BACKLOG.md',next);
 }finally{release();}
}
