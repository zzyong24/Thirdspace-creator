import type {createPlatformCollectionService} from '../../modules/platform-collection';

type CollectionService=ReturnType<typeof createPlatformCollectionService>;
export type CollectedDashboardFacts=Awaited<ReturnType<CollectionService['readDashboardSummary']>>;
type Candidate=CollectedDashboardFacts['workMetrics'][number];
export type CollectedMetricKey='play_count'|'view_count'|'read_count'|'like_count'|'comment_count'|'share_count'|'favorite_count'|'follower_count';
export type CollectedMetric={platform:string;metricKey:CollectedMetricKey;scope:'work'|'account';unit:'count';window:'lifetime';value:number|null;knownCount:number;eligibleCount:number;capturedAt:string|null;observedAt:string|null;sources:string[]};
export type CoveredPublication={id:string;accountId:string;platform:string;metricKeys:ReadonlySet<string>};
const keys:CollectedMetricKey[]=['play_count','view_count','read_count','like_count','comment_count','share_count','favorite_count'];
const time=(s:string)=>Number.isFinite(Date.parse(s))?Date.parse(s):null;
const latestTime=(values:string[])=>values.filter(v=>time(v)!==null).sort((a,b)=>time(a)!-time(b)!).at(-1)??null;
// SEMANTIC_BOUNDARY_ALLOW: 结构排序只规范协议window样本族，不做作品/创作语义匹配。
function canonical(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
export function latestCollectedCandidate(rows:Candidate[]){
 const valid=rows.filter(r=>time(r.observedAt)!==null&&time(r.capturedAt)!==null);
 if(!valid.length)return {value:null,capturedAt:null,observedAt:null,sources:[] as string[]};
 const ordered=valid.slice().sort((a,b)=>time(b.observedAt)!-time(a.observedAt)!||time(b.capturedAt)!-time(a.capturedAt)!);
 const first=ordered[0]!,ties=ordered.filter(r=>time(r.observedAt)===time(first.observedAt)&&time(r.capturedAt)===time(first.capturedAt));
 const same=ties.every(r=>r.value===first.value&&r.availability===first.availability&&r.unit===first.unit&&canonical(r.window)===canonical(first.window));
 const value=same&&first.availability==='available'&&first.unit==='count'&&canonical(first.window)===canonical({kind:'lifetime'})&&typeof first.value==='number'&&Number.isFinite(first.value)&&first.value>=0?first.value:null;
 return {value,capturedAt:first.capturedAt,observedAt:first.observedAt,sources:[...new Set(ties.map(r=>r.source))]};
}
export function projectCollectedDashboard(facts:CollectedDashboardFacts,covered:CoveredPublication[]=[]){
 const excluded=new Map<string,Set<string>>(),coveredByRef=new Map<string,Set<string>>();
 const identity=(...parts:unknown[])=>JSON.stringify(parts);
 for(const p of covered){const key=identity(p.accountId,p.platform,p.id),set=coveredByRef.get(key)??new Set<string>();for(const metric of p.metricKeys)set.add(metric);coveredByRef.set(key,set);}
 for(const work of facts.works){
  const refs=[work.publicationId,work.legacyPublicationId].filter((v):v is string=>!!v);
  const matching=refs.flatMap(ref=>[...(coveredByRef.get(identity(work.accountId,work.platform,ref))??[])]);
  if(matching.length)excluded.set(work.id,new Set(matching));
 }
 const platforms=[...new Set([...facts.accounts.map(a=>a.platform),...facts.works.map(w=>w.platform)])];
 const metrics:CollectedMetric[]=[],knownAccountIds=new Set<string>(),families=new Map<string,Candidate[]>();
 for(const row of [...facts.workMetrics,...facts.accountMetrics]){const key=identity(row.accountId,row.platform,row.platformWorkId,row.metricKey,canonical(row.window)),family=families.get(key)??[];family.push(row);families.set(key,family);}
 const family=(accountId:string,platform:string,workId:string|null,key:string)=>families.get(identity(accountId,platform,workId,key,canonical({kind:'lifetime'})))??[];
 for(const platform of platforms){
  const works=facts.works.filter(w=>w.platform===platform);
  for(const metricKey of keys){
   const eligible=works.filter(w=>!excluded.get(w.id)?.has(metricKey));
   const selected=eligible.map(work=>latestCollectedCandidate(family(work.accountId,work.platform,work.id,metricKey)));
   const known=selected.filter(r=>r.value!==null);
   selected.forEach((r,i)=>{if(r.value!==null)knownAccountIds.add(eligible[i]!.accountId);});
   metrics.push({platform,metricKey,scope:'work',unit:'count',window:'lifetime',value:known.length?known.reduce((n,m)=>n+m.value!,0):null,knownCount:known.length,eligibleCount:eligible.length,capturedAt:latestTime(selected.flatMap(v=>v.capturedAt?[v.capturedAt]:[])),observedAt:latestTime(selected.flatMap(v=>v.observedAt?[v.observedAt]:[])),sources:[...new Set(selected.flatMap(v=>v.sources))]});
  }
 }
 const followerFacts=facts.accounts.map(account=>({accountId:account.id,platform:account.platform,...latestCollectedCandidate(family(account.id,account.platform,null,'follower_count'))}));
 for(const platform of platforms){
  const selected=followerFacts.filter(f=>f.platform===platform),known=selected.filter(f=>f.value!==null);
  metrics.push({platform,metricKey:'follower_count',scope:'account',unit:'count',window:'lifetime',value:known.length?known.reduce((n,m)=>n+m.value!,0):null,knownCount:known.length,eligibleCount:selected.length,capturedAt:latestTime(selected.flatMap(v=>v.capturedAt?[v.capturedAt]:[])),observedAt:latestTime(selected.flatMap(v=>v.observedAt?[v.observedAt]:[])),sources:[...new Set(selected.flatMap(v=>v.sources))]});
 }
 return {accounts:facts.accounts,metrics,followerFacts,knownAccountIds:[...knownAccountIds],catalogWorkCount:facts.works.length,unattributableWorkCount:facts.unattributableWorkCount,deduplicatedWorkCount:[...excluded.values()].filter(v=>v.size>0).length};
}
