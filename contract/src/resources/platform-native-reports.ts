import {z} from 'zod';
import {id,iso8601} from '../primitives';
export const nativeReportKind=z.enum(['officialContent','officialFollowers','channelsDaily','channelsFollowers','channelsWorks']);
export const nativeReportUnit=z.enum(['people','count','signedCount','ratio','seconds','date','opaqueId','text']);
const reportDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v,'Invalid date');
export const nativeReportCell=z.strictObject({raw:z.string().max(100000),value:z.union([z.string().max(100000),z.number().finite(),z.null()])});
export const nativeReportTable=z.strictObject({
 key:z.string().min(1).max(100),label:z.string().min(1).max(200),
 columns:z.array(z.strictObject({key:z.string().min(1).max(200),label:z.string().min(1).max(200),unit:nativeReportUnit})).min(1).max(32),
 rows:z.array(z.array(nativeReportCell).max(32)).max(10000),
}).superRefine((table,ctx)=>{
 if(new Set(table.columns.map(c=>c.key)).size!==table.columns.length)ctx.addIssue({code:'custom',message:'Duplicate column'});
 table.rows.forEach((row,r)=>{
  if(row.length!==table.columns.length)ctx.addIssue({code:'custom',path:['rows',r],message:'Column count mismatch'});
  row.forEach((cell,c)=>{const unit=table.columns[c]?.unit;if(!unit||cell.value===null)return;
   const numeric=['people','count','signedCount','ratio','seconds'].includes(unit);
   if(numeric&&(typeof cell.value!=='number'||(unit!=='signedCount'&&cell.value<0)||(unit==='ratio'&&cell.value>1)))ctx.addIssue({code:'custom',path:['rows',r,c],message:'Value disagrees with unit'});
   if(!numeric&&typeof cell.value!=='string')ctx.addIssue({code:'custom',path:['rows',r,c],message:'Expected native text'});
  });
 });
});
export const platformNativeReportPayload=z.strictObject({
 platform:z.enum(['wechatOfficial','wechatVideo']),kind:nativeReportKind,
 scope:z.enum(['accountDaily','workSelection']),
 selection:z.strictObject({startDate:reportDate,endDate:reportDate,timeZone:z.literal('Asia/Shanghai'),meaning:z.enum(['statisticsDates','publishedDates'])}).refine(v=>v.startDate<=v.endDate,'Selection must be ordered'),
 accumulation:z.enum(['daily','sourceUnspecified']),
 sourcePath:z.enum(['/misc/appmsganalysis','/misc/useranalysis','/platform/statistic/post','/platform/statistic/follower']),
 filename:z.string().min(1).max(200).refine(v=>!/[\/\\\x00-\x1f]/.test(v),'Filename must be a basename'),
 sha256:z.string().regex(/^[a-f0-9]{64}$/),receivedBytes:z.number().int().positive().max(25*1024*1024),
 tables:z.array(nativeReportTable).min(1).max(5),
}).superRefine((r,ctx)=>{
 if(r.tables.reduce((total,table)=>total+table.rows.length,0)>10000)ctx.addIssue({code:'custom',path:['tables'],message:'Report row limit exceeded'});
 const official=r.kind.startsWith('official'),work=r.kind==='channelsWorks';
 const expectedPath={officialContent:'/misc/appmsganalysis',officialFollowers:'/misc/useranalysis',channelsDaily:'/platform/statistic/post',channelsFollowers:'/platform/statistic/follower',channelsWorks:'/platform/statistic/post'}[r.kind];
 if(official!==(r.platform==='wechatOfficial')||r.sourcePath!==expectedPath)ctx.addIssue({code:'custom',message:'Platform/report source mismatch'});
 if((r.scope==='workSelection')!==work||(r.selection.meaning==='publishedDates')!==work||(r.accumulation==='sourceUnspecified')!==work)ctx.addIssue({code:'custom',message:'Report scope/window mismatch'});
});
export const platformNativeReportResource=platformNativeReportPayload.safeExtend({id,userId:id,groupId:id,accountId:id,membershipVersion:z.number().int().positive(),observedAt:iso8601,ingestedAt:iso8601});
export const platformNativeReportsListQuery=z.strictObject({accountId:id,cursor:z.string().nullable(),pageSize:z.number().int().positive().max(100)});
export const platformNativeReportsListResponse=z.strictObject({items:z.array(platformNativeReportResource),nextCursor:z.string().nullable(),total:z.number().int().nonnegative()});
export type NativeReportPayload=z.infer<typeof platformNativeReportPayload>;
export type NativeReportResource=z.infer<typeof platformNativeReportResource>;
export type NativeReportKind=z.infer<typeof nativeReportKind>;
