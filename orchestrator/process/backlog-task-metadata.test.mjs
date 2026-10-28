import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readBacklog } from "./reviewctl.mjs";
import { auditFrontendReceipts } from "./frontend-validation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");
const header = ["ID", "任务", "状态", "审核", "验收", "文档", "一句话"];
function rawMetadata(overrides = {}) {
  const source_line = "| T-A | 完整标题 | 📋 | 待审 | 待验 | [SPEC](SPEC.md) | 完整叙事 |";
  return { schema:"backlog-task-metadata/v1", id:"T-A", title:"完整标题", narrative:"完整叙事", documents:"[SPEC](SPEC.md)", source_line, source_sha256:hash(source_line), source_columns:header, ...overrides };
}
function block(metadata, anchor = `m-${hash(JSON.stringify(metadata)).slice(0,8)}`) {
  return { anchor, text:`<a id="${anchor}"></a>\n\`\`\`backlog-task-metadata\n${JSON.stringify(metadata,null,2)}\n\`\`\`\n` };
}
function fixture(t, metadata = rawMetadata(), current = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"backlog-metadata-")));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,"SPEC.md"),"# 本任务规格\n");
  const detail = block(metadata);
  fs.writeFileSync(path.join(root,"BACKLOG-details.md"),detail.text);
  fs.writeFileSync(path.join(root,"BACKLOG.md"),`|ID|状态|审核|验收|文档|\n|---|---|---|---|---|\n|${current.id??"T-A"}|${current.status??"⏸️"}|${current.review??"PASS[REV:123456789abc]"}|${current.acceptance??"—"}|[D](BACKLOG-details.md#${detail.anchor})|\n`);
  return {root,metadata,detail,backlogFile:path.join(root,"BACKLOG.md")};
}
async function api() { return import("./backlog-task-metadata.mjs"); }

test("五列索引恢复标题、原文档和叙事，当前状态与票据不得被历史覆盖",async t=>{
  const f=fixture(t);const {readBacklogTaskMetadata}=await api();
  const task=readBacklogTaskMetadata(f).tasks[0];
  assert.equal(task.title,"完整标题");assert.equal(task.narrative,"完整叙事");
  assert.equal(task.document,"[SPEC](SPEC.md)");assert.deepEqual(task.documents,["SPEC.md"]);
  assert.equal(task.status,"⏸️");assert.equal(task.review,"PASS[REV:123456789abc]");assert.equal(task.acceptance,"—");
  assert.equal(task.row.cells.length,5);
});
test("旧七列与带标题五列暂停表按真实表头解析，生成内容锚点幂等",async()=>{
  const {parseBacklogTaskRows,createTaskMetadata}=await api();
  const text="|ID|任务|状态|文档|恢复条件|\n|---|---|---|---|---|\n|T-OLD|旧标题|⏸️|—|待设备|\n\n"+
    "|ID|任务|状态|审核|验收|文档|一句话|\n|---|---|---|---|---|---|---|\n"+rawMetadata().source_line;
  const {tasks}=parseBacklogTaskRows(text);
  assert.equal(tasks.length,2);assert.equal(tasks[0].title,"旧标题");assert.equal(tasks[0].narrative,"待设备");
  assert.equal(tasks[0].acceptance,null);assert.equal(tasks[1].review,"待审");
  const created=createTaskMetadata(tasks[1]);assert.deepEqual(created.metadata,rawMetadata());
  assert.equal(created.anchor,block(rawMetadata()).anchor);assert.equal(createTaskMetadata(tasks[1]).block,created.block);
  assert.equal(createTaskMetadata(tasks[1],{anchorHashLength:16}).anchor.length,18);
});
test("缺锚点、重复锚点、串任务、损坏原行、损坏字段和内容锚点必须失败",async t=>{
  const {readBacklogTaskMetadata}=await api();
  for(const [name,change] of [
    ["missing",f=>fs.writeFileSync(path.join(f.root,"BACKLOG-details.md"),"# no anchor")],
    ["duplicate",f=>fs.appendFileSync(path.join(f.root,"BACKLOG-details.md"),f.detail.text)],
    ["foreign-task",f=>fs.writeFileSync(f.backlogFile,fs.readFileSync(f.backlogFile,"utf8").replace("|T-A|","|T-B|"))],
    ["hash",f=>{const m={...f.metadata,source_sha256:"0".repeat(64)};const b=block(m);fs.writeFileSync(path.join(f.root,"BACKLOG-details.md"),b.text);fs.writeFileSync(f.backlogFile,fs.readFileSync(f.backlogFile,"utf8").replace(f.detail.anchor,b.anchor));}],
    ["title",f=>{const m={...f.metadata,title:"篡改标题"};const b=block(m);fs.writeFileSync(path.join(f.root,"BACKLOG-details.md"),b.text);fs.writeFileSync(f.backlogFile,fs.readFileSync(f.backlogFile,"utf8").replace(f.detail.anchor,b.anchor));}],
    ["anchor-content",f=>fs.writeFileSync(path.join(f.root,"BACKLOG-details.md"),f.detail.text.replace("完整叙事","被改叙事"))],
  ]) await t.test(name,sub=>{const f=fixture(sub);change(f);assert.throws(()=>readBacklogTaskMetadata(f));});
});
test("保全外部历史引用但仅返回仓内文档，不读取或递归详情",async t=>{
  const documents="[SPEC](SPEC.md) [网站](https://example.test/doc) [异机](/Users/other/Growth/SPEC.md)";
  const source_line=rawMetadata().source_line.replace("[SPEC](SPEC.md)",documents);
  const f=fixture(t,rawMetadata({documents,source_line,source_sha256:hash(source_line)}));
  const {readBacklogTaskMetadata}=await api();const task=readBacklogTaskMetadata(f).tasks[0];
  assert.equal(task.document,documents);assert.deepEqual(task.documents,["SPEC.md"]);assert.equal(task.documentDiagnostics.length,2);
});
test("相对逃逸、编码逃逸、符号链接越界和递归索引显式失败",async t=>{
  const {readBacklogTaskMetadata}=await api();
  for(const target of ["../outside.md","%2e%2e/outside.md","escape.md","BACKLOG-details.md#other"])
    await t.test(target,sub=>{
      const documents=`[SPEC](${target})`,source_line=rawMetadata().source_line.replace("[SPEC](SPEC.md)",documents);
      const f=fixture(sub,rawMetadata({documents,source_line,source_sha256:hash(source_line)}));
      if(target==="escape.md")fs.symlinkSync(os.tmpdir(),path.join(f.root,"escape.md"));
      assert.throws(()=>readBacklogTaskMetadata(f));
    });
});
test("reviewctl 解析索引时审核绑定使用本任务原SPEC并保留可写列坐标",t=>{
  const f=fixture(t);const task=readBacklog(f.backlogFile).tasks[0];
  assert.equal(task.document,"[SPEC](SPEC.md)");assert.equal(task.row.cells[task.columns.review],"PASS[REV:123456789abc]");
});
test("frontend audit 不把详情里另一任务的 journey 当成本任务",t=>{
  const f=fixture(t,rawMetadata(),{review:"—"});
  fs.appendFileSync(path.join(f.root,"BACKLOG-details.md"),"\n<a id=\"other\"></a>\n```frontend-journey-contract\n{}\n```\n");
  assert.deepEqual(auditFrontendReceipts(f),[]);
});
test("frontend audit 不能通过索引隐藏本任务真实journey并以验收—绕过",t=>{
  const f=fixture(t,rawMetadata(),{review:"—"});
  fs.writeFileSync(path.join(f.root,"SPEC.md"),"```frontend-journey-contract\n{}\n```\n");
  assert.match(auditFrontendReceipts(f).join("\n"),/不能以 验收=— 绕过/);
});
test("pmem tasks 五列活动索引不得静默丢任务或用状态当标题",t=>{
  const f=fixture(t,rawMetadata(),{status:"📋",review:"—"});
  const dir=path.join(f.root,"orchestrator/process");fs.mkdirSync(dir,{recursive:true});
  for(const file of ["pmem.mjs","backlog-task-metadata.mjs"])if(fs.existsSync(path.join(here,file)))fs.copyFileSync(path.join(here,file),path.join(dir,file));
  const result=spawnSync(process.execPath,[path.join(dir,"pmem.mjs"),"tasks"],{cwd:f.root,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/T-A\s+完整标题/);
});


test("旧暂停表搁置列仍保存状态及带空格子阶段ID",async()=>{
  const {parseBacklogTaskRows,createTaskMetadata}=await api();
  const parsed=parseBacklogTaskRows("|ID|任务|搁置|文档|恢复条件|\n|---|---|---|---|---|\n|T-904 S2|旧阶段|⏸️ 待设备|—|人工恢复|\n");
  assert.equal(parsed.tasks[0].status,"⏸️ 待设备");assert.equal(parsed.tasks[0].id,"T-904 S2");
  assert.equal(createTaskMetadata(parsed.tasks[0]).metadata.source_columns[2],"搁置");
});


test("表内空行和说明保留表头，无表头新章节任务必须显式失败",async()=>{
  const {parseBacklogTaskRows}=await api();
  const head="|ID|任务|状态|文档|一句话|\n|---|---|---|---|---|\n";
  const rows="|T-A|任务甲|📋|—|甲|\n\n旧表内说明。\n\n|T-B|任务乙|⏸️|—|乙|\n";
  assert.deepEqual(parseBacklogTaskRows(head+rows).tasks.map(task=>task.id),["T-A","T-B"]);
  assert.throws(()=>parseBacklogTaskRows(head+rows+"\n## 新章节\n|T-C|任务丙|📋|—|丙|\n"),/表头/);
});


test("真实SPEC与旧详情回链并存时只读取真实SPEC并记录回链诊断",async t=>{
  const documents="[SPEC](SPEC.md) [旧详情](BACKLOG-details.md#t-a)";
  const source_line=rawMetadata().source_line.replace("[SPEC](SPEC.md)",documents);
  const f=fixture(t,rawMetadata({documents,source_line,source_sha256:hash(source_line)}));
  const {readBacklogTaskMetadata}=await api();const task=readBacklogTaskMetadata(f).tasks[0];
  assert.equal(task.document,documents);assert.deepEqual(task.documents,["SPEC.md"]);
  assert.deepEqual(task.documentDiagnostics,[{target:"BACKLOG-details.md#t-a",reason:"detail-reference-not-followed"}]);
});


test("原文档混用Markdown链接与多个裸路径时均保留",async t=>{
  const documents="[SPEC](SPEC.md) `second.md` third.md";
  const source_line=rawMetadata().source_line.replace("[SPEC](SPEC.md)",documents);
  const f=fixture(t,rawMetadata({documents,source_line,source_sha256:hash(source_line)}));
  fs.writeFileSync(path.join(f.root,"second.md"),"# 第二文档\n");fs.writeFileSync(path.join(f.root,"third.md"),"# 第三文档\n");
  const {readBacklogTaskMetadata}=await api();
  assert.deepEqual(readBacklogTaskMetadata(f).tasks[0].documents,["SPEC.md","second.md","third.md"]);
});


test("历史缺失文档保留显式诊断，不阻断五列索引或七列任务读取",async t=>{
  const {readBacklogTaskMetadata}=await api();
  for(const withBackref of [false,true])await t.test(`backref=${withBackref}`,sub=>{
    const documents="[SPEC](missing.json)"+(withBackref?" [旧详情](BACKLOG-details.md#t-a)":"");
    const source_line=rawMetadata().source_line.replace("[SPEC](SPEC.md)",documents);
    const f=fixture(sub,rawMetadata({documents,source_line,source_sha256:hash(source_line)}));
    const indexed=readBacklogTaskMetadata(f).tasks[0];
    assert.equal(indexed.document,documents);assert.deepEqual(indexed.documents,[]);
    assert.deepEqual(indexed.documentDiagnostics[0],{target:"missing.json",reason:"missing-document-not-read"});
    fs.writeFileSync(f.backlogFile,`|${header.join("|")}|\n|${header.map(()=>"---").join("|")}|\n${source_line}\n`);
    const full=readBacklogTaskMetadata(f).tasks[0];
    assert.equal(full.title,"完整标题");assert.equal(full.document,documents);assert.deepEqual(full.documents,[]);
    assert.deepEqual(full.documentDiagnostics[0],{target:"missing.json",reason:"missing-document-not-read"});
  });
});
