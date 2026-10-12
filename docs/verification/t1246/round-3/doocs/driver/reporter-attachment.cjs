'use strict';
// 仅严格投影原reporter附件字节；不生成业务内容，不补缺失截图/回执。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function ownedFile(p,root){
 if(typeof p!=='string'||!path.isAbsolute(p)||!p.startsWith(root+path.sep)||fs.realpathSync(p)!==p)throw Error('ATTACHMENT_OWNED_PATH_REQUIRED');
 const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid())throw Error('ATTACHMENT_REGULAR_OWNER_REQUIRED');return fs.readFileSync(p);
}
function strictBase64(body){
 if(typeof body!=='string'||!body.length||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body))throw Error('ATTACHMENT_CANONICAL_BASE64_REQUIRED');
 const b=Buffer.from(body,'base64');if(b.toString('base64')!==body)throw Error('ATTACHMENT_CANONICAL_BASE64_REQUIRED');return b;
}
function projectReporterAttachment({runRoot,reportPath,reportSha256,attachment,contentType,id}){
 const root=fs.realpathSync(runRoot),st=fs.lstatSync(runRoot);if(root!==runRoot||!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o777)!==0o700)throw Error('ATTACHMENT_OWNED_ROOT_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(reportSha256??'')||! /^(?:1366|390)-(?:shot-[012]|public-receipt|fixture-[a-z0-9-]+)$/.test(id??''))throw Error('ATTACHMENT_EXACT_SOURCE_AND_ID_REQUIRED');
 const reportBytes=ownedFile(reportPath,root);if(sha(reportBytes)!==reportSha256)throw Error('ORIGINAL_REPORT_BYTES_DRIFT');const report=JSON.parse(reportBytes.toString('utf8'));
 const sourcePointers=[];function walk(v,p){if(v===null||typeof v!=='object')return;if(Array.isArray(v.attachments))for(const [i,a]of v.attachments.entries())if(JSON.stringify(a)===JSON.stringify(attachment))sourcePointers.push([...p,'attachments',i]);for(const [k,x]of Object.entries(v))if(k!=='attachments'&&x&&typeof x==='object')walk(x,[...p,k]);}walk(report,[]);
 if(!sourcePointers.length||!attachment||attachment.contentType!==contentType||!['image/png','application/json'].includes(contentType))throw Error('ORIGINAL_ATTACHMENT_MISSING_OR_MIME_MISMATCH');
 const hasPath=typeof attachment.path==='string'&&attachment.path.length>0,hasBody=Object.hasOwn(attachment,'body');if(!hasPath&&!hasBody)throw Error('ORIGINAL_ATTACHMENT_BYTES_MISSING');
 let bytes=hasPath?ownedFile(attachment.path,root):null;const inline=hasBody?strictBase64(attachment.body):null;if(bytes&&inline&&!bytes.equals(inline))throw Error('ORIGINAL_PATH_INLINE_BYTES_MISMATCH');bytes??=inline;
 if(contentType==='image/png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('ORIGINAL_PNG_SIGNATURE_INVALID');
 if(contentType==='application/json'){const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))throw Error('ORIGINAL_JSON_UTF8_INVALID');JSON.parse(text);}
 const sourceSha256=sha(bytes);if(hasPath)return {path:attachment.path,sha256:sourceSha256,bytes:bytes.length,originalReportPath:reportPath,originalReportSha256:reportSha256,originalAttachmentPointers:sourcePointers,originalEncoding:hasBody?'path-and-base64':'path',projection:false};
 const dir=path.join(root,'decoded-original-attachments');if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});const ds=fs.lstatSync(dir);if(fs.realpathSync(dir)!==dir||!ds.isDirectory()||ds.isSymbolicLink()||ds.uid!==process.getuid()||(ds.mode&0o777)!==0o700)throw Error('ATTACHMENT_PROJECTION_ROOT_REQUIRED');
 const target=path.join(dir,id+(contentType==='image/png'?'.png':'.json'));fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});if(sha(ownedFile(target,root))!==sourceSha256||sha(ownedFile(reportPath,root))!==reportSha256)throw Error('ATTACHMENT_PROJECTION_OR_REPORT_BYTES_DRIFT');
 const proof={path:target,sha256:sourceSha256,bytes:bytes.length,originalReportPath:reportPath,originalReportSha256:reportSha256,originalAttachmentPointers:sourcePointers,originalEncoding:'canonical-base64',projection:true,reCaptured:false};fs.writeFileSync(target+'.projection.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});return proof;
}
module.exports={projectReporterAttachment,strictBase64};
