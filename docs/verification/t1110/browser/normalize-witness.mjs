// 纯脱敏pack格式适配；不读取原下载、账号、Cookie或平台profile。
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function normalizeWitness(path,{observedAt}={}) {
  const source=readFileSync(path,'utf8'),raw=JSON.parse(source);
  const projection=raw.mode==='representative-private-projection'&&raw.execution==='fixture-only-no-platform-proof';
  const v1=raw.schema==='t1110-report-witness/v1';
  if(!projection&&!v1)throw Error('必须使用root明确脱敏的实文件代表投影或有来源witness的v1 pack');
  const payloads=projection?raw.reports:raw.payloads;
  if(!Array.isArray(payloads)||payloads.length!==5)throw Error('本旅程需要五种真实下载的脱敏报表投影，不能任意补数据');
  const date=observedAt??raw.observedAt??statSync(path).mtime.toISOString();
  if(!Number.isFinite(Date.parse(date)))throw Error('报表观察时间不合法');
  const observationRole=observedAt?'root显式提供的报表观察时间':raw.observedAt?'pack提供的报表观察时间':'脱敏pack文件mtime，仅测试回读时间，不证明平台采集时间';
  const witnesses=projection?payloads.map(report=>({id:`sha256:${report.sha256}`,role:`${report.kind}实下载的脱敏代表投影；仅text/opaqueId改别名，日期/数值/0/null/单位保留；source hash指原文件，不指投影字节`})):raw.witnesses;
  if(!Array.isArray(witnesses)||!witnesses.length||witnesses.some(w=>!w.id||!w.role))throw Error('来源witness不完整');
  return {schema:'t1110-report-witness/v1',mode:projection?'representative-private-projection':raw.mode??'source-witness',execution:'fixture-only-no-platform-proof',observedAt:date,observationRole,witnesses,payloads,sourcePackSha256:createHash('sha256').update(source).digest('hex')};
}
