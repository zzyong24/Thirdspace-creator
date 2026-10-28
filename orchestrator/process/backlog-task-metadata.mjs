// BACKLOG owns state and receipts. Details contain only immutable task metadata.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const TASK_METADATA_SCHEMA = "backlog-task-metadata/v1";
const DETAIL_FILE = "BACKLOG-details.md";
const sha = text => createHash("sha256").update(text,"utf8").digest("hex");
const fieldNames = ["schema","id","title","narrative","documents","source_line","source_sha256","source_columns"];
function fail(message) { throw new Error(`BACKLOG 元数据：${message}`); }
function rowOf(line) {
  const segments=line.split(/(?<!\\)\|/);
  const start=segments[0]?.trim()===""?1:0,end=segments.at(-1)?.trim()===""?segments.length-1:segments.length;
  const indexes=Array.from({length:end-start},(_,index)=>index+start);
  return {segments,indexes,cells:indexes.map(index=>segments[index].trim())};
}
const separator=line=>/^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/.test(line??"");
function columnsOf(header) {
  const find=predicate=>header.findIndex(predicate);
  return {id:find(cell=>cell.toUpperCase()==="ID"),title:find(cell=>cell==="任务"||cell==="标题"),
    status:find(cell=>/状态|搁置/.test(cell)),review:find(cell=>cell.includes("审核")),
    acceptance:find(cell=>cell.includes("验收")),document:find(cell=>/文档|SPEC|引用/i.test(cell)),
    narrative:find(cell=>/一句话|描述|说明|恢复条件|暂停原因/.test(cell))};
}
export function parseBacklogTaskRows(text) {
  const lines=text.split("\n"),tasks=[];let header=null,columns=null;
  for(let lineIndex=0;lineIndex<lines.length;lineIndex++) {
    const line=lines[lineIndex];
    if(!line.trimStart().startsWith("|")){if(/^#{1,6}\s/.test(line)){header=null;columns=null;}continue;}
    if(separator(line))continue;
    const row=rowOf(line);
    if(separator(lines[lineIndex+1])){header=row.cells;columns=columnsOf(header);continue;}
    if(!columns||columns.id<0){if(/^T-/.test(row.cells[0]??""))fail(`第 ${lineIndex+1} 行任务缺少可验证表头`);continue;}
    if(!/^T-/.test(row.cells[columns.id]??""))continue;
    if(row.cells.length!==header.length)fail(`第 ${lineIndex+1} 行列数与表头不一致`);
    const cell=name=>columns[name]>=0?row.cells[columns[name]]:"";
    tasks.push({id:cell("id"),title:cell("title"),status:cell("status"),review:cell("review"),
      acceptance:columns.acceptance>=0?cell("acceptance"):null,document:cell("document"),narrative:cell("narrative"),
      lineIndex,line,row,columns:{...columns},header:[...header]});
  }
  return {lines,tasks};
}
function validateMetadata(value) {
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join()!==[...fieldNames].sort().join())fail("metadata 字段集合不合法");
  if(value.schema!==TASK_METADATA_SCHEMA)fail("metadata schema 不支持");
  for(const key of fieldNames.filter(key=>key!=="source_columns"))if(typeof value[key]!=="string")fail(`${key} 必须为字符串`);
  if(!value.id.startsWith("T-")||!value.title.trim()||/[\r\n]/.test(value.source_line))fail("ID、标题或原始行不合法");
  if(!Array.isArray(value.source_columns)||value.source_columns.some(cell=>typeof cell!=="string"||/[\r\n|]/.test(cell)))fail("原始表头不合法");
  if(value.source_sha256!==sha(value.source_line))fail(`${value.id} 原行 SHA256 不匹配`);
  const source=parseBacklogTaskRows(`|${value.source_columns.join("|")}|\n|${value.source_columns.map(()=>"---").join("|")}|\n${value.source_line}`).tasks;
  if(source.length!==1||source[0].columns.title<0)fail("原行必须是有完整标题的唯一任务行");
  const original=source[0];
  if(original.id!==value.id||original.title!==value.title||original.narrative!==value.narrative||original.document!==value.documents)fail(`${value.id} 元数据与原行字段不一致`);
  return Object.fromEntries(fieldNames.map(key=>[key,value[key]]));
}
export function createTaskMetadata(task,{anchorHashLength=8}={}) {
  if(!Number.isInteger(anchorHashLength)||anchorHashLength<8||anchorHashLength>64)fail("锚点 hash 长度必须为 8–64");
  const metadata=validateMetadata({schema:TASK_METADATA_SCHEMA,id:task.id,title:task.title,narrative:task.narrative??"",
    documents:task.document??"",source_line:task.line,source_sha256:sha(task.line),source_columns:task.header});
  const anchor=`m-${sha(JSON.stringify(metadata)).slice(0,anchorHashLength)}`;
  return {metadata,anchor,link:`[详情](${DETAIL_FILE}#${anchor})`,
    block:`\n<a id="${anchor}"></a>\n\`\`\`backlog-task-metadata\n${JSON.stringify(metadata,null,2)}\n\`\`\`\n`};
}
function inside(root,target) {
  const relative=path.relative(root,target);
  return relative===""||(!path.isAbsolute(relative)&&relative!==".."&&!relative.startsWith(`..${path.sep}`));
}
function checkedFile(root,relative) {
  const absolute=path.resolve(root,relative);
  if(!inside(root,absolute))fail(`文档路径越界：${relative}`);
  if(!fs.existsSync(absolute))return null;
  const actual=fs.realpathSync(absolute);
  if(!inside(root,actual))fail(`文档符号链接越界：${relative}`);
  if(!fs.statSync(actual).isFile())fail(`文档不是普通文件：${relative}`);
  return actual;
}
// The same declarations drive reading and receipt binding. A missing file must
// not erase a declared binding, whether written as Markdown or a bare path.
export function taskDocumentReferences(cell) {
  if(typeof cell!=="string")fail("文档声明必须为字符串");
  const links=[...cell.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)].map(match=>({label:match[1],target:match[2].trim().replace(/^<|>$/g,"")}));
  // Bare document paths are supported; never interpret arbitrary narrative as links.
  const bare=cell.replace(/\[[^\]]*\]\([^)]+\)/g," ");
  for(const match of bare.matchAll(/(?:^|[\s`])([^\s`]+\.(?:md|txt|json|ya?ml))(?=$|[\s`])/g))links.push({label:"",target:match[1]});
  return links;
}
function localDocuments(root,cell,{indexed=false}={}) {
  const documents=[],diagnostics=[],seen=new Set();
  const links=taskDocumentReferences(cell);
  for(const {target} of links) {
    if(/^[a-z][a-z0-9+.-]*:/i.test(target)||path.isAbsolute(target)||target.startsWith("\\")) {diagnostics.push({target,reason:"external-reference-not-read"});continue;}
    let decoded;try{decoded=decodeURIComponent(target);}catch{fail(`文档链接编码无效：${target}`);}
    if(/[\\\u0000-\u001f]/.test(decoded)||path.isAbsolute(decoded)||decoded.split(/[?#]/,1)[0].split("/").includes(".."))fail(`文档相对路径不安全：${target}`);
    const relative=decoded.split(/[?#]/,1)[0].replace(/^\.\//,"");
    if(!relative)continue;
    if(relative===DETAIL_FILE){diagnostics.push({target,reason:"detail-reference-not-followed"});continue;}
    const file=checkedFile(root,relative);
    if(!file){diagnostics.push({target,reason:"missing-document-not-read"});continue;}
    if(!seen.has(relative)){seen.add(relative);documents.push(relative);}
  }
  if(indexed&&!documents.length&&diagnostics.length>0&&diagnostics.every(item=>item.reason==="detail-reference-not-followed"))fail("元数据仅引用详情索引，不能递归猜测原文档");
  return {documents,documentDiagnostics:diagnostics};
}
function readIndexedMetadata(root,task,cache) {
  const match=task.document.trim().match(/^\[[^\]]+\]\(BACKLOG-details\.md#(m-[a-f0-9]{8,64})\)$/);
  if(!match)fail(`${task.id} 五列索引必须精确链接结构化详情锚点`);
  const anchor=match[1],file=checkedFile(root,DETAIL_FILE);
  if(!file)fail(`${task.id} 详情文件不存在`);
  if(!cache.has(file)) {
    const text=fs.readFileSync(file,"utf8");
    const anchors=[...text.matchAll(/<a\s+id=["']([^"']+)["']\s*><\/a>/g)];
    const sections=new Map();
    for(let index=0;index<anchors.length;index++) {
      const entry=anchors[index],start=entry.index+entry[0].length,end=anchors[index+1]?.index??text.length;
      const existing=sections.get(entry[1])??[];existing.push(text.slice(start,end));sections.set(entry[1],existing);
    }
    cache.set(file,sections);
  }
  const matches=cache.get(file).get(anchor)??[];
  if(matches.length!==1)fail(`${task.id} 详情锚点必须唯一：${anchor}（实际 ${matches.length}）`);
  const section=matches[0];
  const blocks=[...section.matchAll(/^```backlog-task-metadata\r?\n([\s\S]*?)^```\s*$/gm)];
  if(blocks.length!==1)fail(`${task.id} 锚点段落必须含唯一 metadata 块`);
  let metadata;try{metadata=JSON.parse(blocks[0][1]);}catch{fail(`${task.id} metadata JSON 损坏`);}
  metadata=validateMetadata(metadata);
  if(metadata.id!==task.id)fail(`${task.id} 索引串到任务 ${metadata.id}`);
  if(anchor!==`m-${sha(JSON.stringify(metadata)).slice(0,anchor.length-2)}`)fail(`${task.id} 内容锚点不匹配`);
  return {metadata,metadataReference:`${DETAIL_FILE}#${anchor}`};
}
export function resolveTaskMetadata({root,task,cache=new Map()}) {
  root=fs.realpathSync(root);
  const indexed=task.columns.title<0;
  if(indexed) {
    if(task.row.cells.length!==5||["status","review","acceptance","document"].some(key=>task.columns[key]<0))fail(`${task.id} 缺标题且不是五列索引`);
    const {metadata,metadataReference}=readIndexedMetadata(root,task,cache);
    const document=metadata.documents;
    return {...task,title:metadata.title,narrative:metadata.narrative,document,metadataReference,
      ...localDocuments(root,document,{indexed:true})};
  }
  return {...task,...localDocuments(root,task.document)};
}
export function readBacklogTaskMetadata({root,backlogFile=path.join(root,"BACKLOG.md"),text}={}) {
  const parsed=parseBacklogTaskRows(text??fs.readFileSync(backlogFile,"utf8"));
  const cache=new Map();
  return {...parsed,tasks:parsed.tasks.map(task=>resolveTaskMetadata({root,task,cache}))};
}
