import {z} from "zod";
import {id, platformId} from "../primitives";
import {creativeOutputType, creativeResultStatus} from "./creative-results";

/** T-1043 来源与回执协议；完整服务待闭合，尚未注册互转操作。 */
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const offset = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const outputConversionTextRange = z.object({
  field:z.enum(["body","script"]), start:offset, end:offset, textDigest:sha256,
}).strict().refine(value=>value.end>value.start,{message:"选区必须为非空 UTF-16 范围"});
// textDigest 是完整字段的 UTF-8 SHA-256；start/end 为 JS UTF-16 下标，end 不含。
// owner 必须重新读历史字段，核验摘要、边界及代理对；schema 不把选区当可信正文。
const sourceField = z.enum(["title","body","summary","tags","script"]);
const selectedFields = {
  sourceSectionIds:z.array(id), sourceFields:z.array(sourceField), textRanges:z.array(outputConversionTextRange),
};
const selectedSelection = z.object({mode:z.literal("selected"), ...selectedFields}).strict();
const selection = z.discriminatedUnion("mode",[
  z.object({mode:z.literal("whole")}).strict(), selectedSelection,
]).superRefine((value,ctx)=>{
  if(value.mode==="selected") validateSelection(value,ctx);
});
type Selected = z.infer<typeof selectedSelection>;
function distinct(values:unknown[],ctx:z.RefinementCtx,path:string) {
  // SEMANTIC_BOUNDARY_ALLOW: 仅核验明确 ID/字段重复，不选择创作内容。
  if(new Set(values.map(value=>JSON.stringify(value))).size!==values.length)
    ctx.addIssue({code:"custom",message:"选择项重复",path:[path]});
}
function validateSelection(value:Omit<Selected,"mode">,ctx:z.RefinementCtx) {
  if(!value.sourceSectionIds.length && !value.sourceFields.length && !value.textRanges.length)
    ctx.addIssue({code:"custom",message:"局部转换必须明确选区"});
  distinct(value.sourceSectionIds,ctx,"sourceSectionIds");
  distinct(value.sourceFields,ctx,"sourceFields");
  for(let i=0;i<value.textRanges.length;i++) {
    const range=value.textRanges[i]!;
    if(value.sourceFields.includes(range.field))ctx.addIssue({code:"custom",message:"同一字段不能同时全选与局部选",path:["textRanges",i]});
    for(let j=0;j<i;j++) {
      const prior=value.textRanges[j]!;
      if(prior.field===range.field && (prior.textDigest!==range.textDigest || (range.start<prior.end && prior.start<range.end)))
        ctx.addIssue({code:"custom",message:"同字段范围重叠或摘要不一致",path:["textRanges",i]});
    }
  }
}
const common = {
  sourceOutputId:id, sourceVersionId:id,
  targetPlatform:platformId.nullable().optional(),
  clientRequestId:z.string().min(8).max(128),
  // 顺序就是明确复用顺序；不设分页截断，owner 核验全部真实文件。
  reuseImages:z.array(z.object({assetId:id,assetFileId:id}).strict()),
};
const whole = {mode:z.literal("whole")};
const selected = {mode:z.literal("selected"),...selectedFields};
// targetFields 是用户明确授权的写入范围，不是代码按业务关键词推断的映射。
export const outputConversionRequest = z.union([
  z.object({...common,...whole,targetType:z.literal("article")}).strict(),
  z.object({...common,...whole,targetType:z.literal("image")}).strict(),
  z.object({...common,...whole,targetType:z.literal("video")}).strict(),
  z.object({...common,...selected,targetType:z.literal("article"),targetFields:z.array(z.enum(["title","summary","sections"])).min(1)}).strict(),
  z.object({...common,...selected,targetType:z.literal("image"),targetFields:z.array(z.enum(["title","body","summary","tags","cardBriefs"])).min(1)}).strict(),
  z.object({...common,...selected,targetType:z.literal("video"),targetFields:z.array(z.literal("script")).min(1)}).strict(),
]).superRefine((value,ctx)=>{
  distinct(value.reuseImages,ctx,"reuseImages");
  if(value.mode==="selected") {
    validateSelection(value,ctx);
    distinct(value.targetFields,ctx,"targetFields");
  }
});

/** 此引用只可由来源 owner 实际读取产生；不接受 client 自报正文。 */
export const outputConversionSourceAnchor = z.object({
  kind:z.literal("output_version"), sourceOutputId:id, artifactId:id, versionId:id,
  sourceType:creativeOutputType, selectionDigest:sha256, selection,
}).strict();

/** 原任务冻结完整转换意图；不能以源锚点代替目标、素材及选区授权。 */
export const outputConversionContext=z.object({request:outputConversionRequest,sourceAnchor:outputConversionSourceAnchor}).strict()
 .superRefine(({request,sourceAnchor},ctx)=>{
  // SEMANTIC_BOUNDARY_ALLOW: 仅核验请求和来源身份、显式选区相等，不判断转换内容。
  const identity=(value:{mode:string;sourceSectionIds?:string[];sourceFields?:string[];textRanges?:z.infer<typeof outputConversionTextRange>[]})=>
   value.mode==="whole"?"whole":JSON.stringify({ids:[...(value.sourceSectionIds??[])].sort(),fields:[...(value.sourceFields??[])].sort(),
    ranges:[...(value.textRanges??[])].sort((a,b)=>a.field.localeCompare(b.field)||a.start-b.start)});
  if(request.sourceOutputId!==sourceAnchor.sourceOutputId || request.sourceVersionId!==sourceAnchor.versionId ||
     request.targetType===sourceAnchor.sourceType || identity(request)!==identity(sourceAnchor.selection))
   ctx.addIssue({code:"custom",message:"冻结请求与来源或选区不一致"});
 });
export type OutputConversionContext=z.infer<typeof outputConversionContext>;

const targetField = z.enum(["title","summary","sections","body","tags","cardBriefs","script"]);
export const outputConversionFieldAdoption = z.discriminatedUnion("status",[
  z.object({status:z.literal("not_adopted")}).strict(),
  z.object({status:z.literal("adopted"),versionId:id,clientRequestId:z.string().min(8).max(128)}).strict(),
]);
export const outputConversionReceiptItem = z.object({
  targetField,resultId:id,taskId:id.nullable(),status:creativeResultStatus,errorCode:z.string().min(1).nullable(),
  // status 是原结果生成状态；正式落稿必须另有此字段的 owner 回执。
  adoption:outputConversionFieldAdoption,
}).strict().superRefine((value,ctx)=>{
  if(["running","awaiting_confirmation","succeeded","adopted"].includes(value.status) && !value.taskId)
    ctx.addIssue({code:"custom",message:"此状态必须具有真实任务回执",path:["taskId"]});
  if(value.adoption.status==="adopted" && !["succeeded","adopted"].includes(value.status))
    ctx.addIssue({code:"custom",message:"未完成的生成不能声明字段已采用",path:["adoption"]});
  if(value.status==="adopted" && value.adoption.status!=="adopted")
    ctx.addIssue({code:"custom",message:"整结果已采用必须具有每个字段的真实回执",path:["adoption"]});
  if(value.status==="failed" && !value.errorCode)
    ctx.addIssue({code:"custom",message:"失败必须保留真实原因",path:["errorCode"]});
});
const allowedFields = {
  article:["title","summary","sections"], image:["title","body","summary","tags","cardBriefs"],video:["script"],
} as const;
// whole 最低交付结构，待具体合同评审。未成功项仍保留真实失败/排队回执，不阻断手工稿。
const wholeRequiredFields = {article:["title","sections"],image:["title","body","cardBriefs"],video:["script"]} as const;

/** 复用原 result/bundle 账本；resultId/taskId 是 primary 单项，不是聚合 ID。 */
export const outputConversionReceipt = z.object({
  targetOutputId:id,targetType:creativeOutputType,resultId:id,taskId:id.nullable(),bundleId:id.nullable(),
  sourceAnchor:outputConversionSourceAnchor,
  requestSummary:outputConversionRequest,
  targetFields:z.array(targetField).min(1),items:z.array(outputConversionReceiptItem).min(1),
  status:z.enum(["queued","running","complete","partial_completed","failed","cancelled"]),
}).strict().superRefine((value,ctx)=>{
  const issue=(message:string,path:string[])=>ctx.addIssue({code:"custom",message,path});
  if(value.targetType===value.sourceAnchor.sourceType)issue("转换目标必须是另一作品类型",["targetType"]);
  const request=value.requestSummary;
  if(request.targetType!==value.targetType || request.sourceOutputId!==value.sourceAnchor.sourceOutputId || request.sourceVersionId!==value.sourceAnchor.versionId)
    issue("冻结请求与真实源/目标锚点不一致",["requestSummary"]);
  const sourceSelection=request.mode==="whole"?{mode:"whole"}:{mode:"selected",sourceSectionIds:request.sourceSectionIds,sourceFields:request.sourceFields,textRanges:request.textRanges};
  // SEMANTIC_BOUNDARY_ALLOW: 仅核验同一组明确选区身份；owner 可按保存顺序排序，不增删或合并范围。
  const selectionIdentity=(selected:typeof sourceSelection)=>selected.mode==="whole"?"whole":JSON.stringify({
    sourceSectionIds:[...(selected.sourceSectionIds??[])].sort(),sourceFields:[...(selected.sourceFields??[])].sort(),
    textRanges:[...(selected.textRanges??[])].sort((a,b)=>a.field.localeCompare(b.field)||a.start-b.start),
  });
  if(selectionIdentity(sourceSelection)!==selectionIdentity(value.sourceAnchor.selection))issue("冻结请求的选区不一致",["requestSummary"]);
  distinct(value.targetFields,ctx,"targetFields");
  const fields=value.items.map(item=>item.targetField);
  distinct(fields,ctx,"items");
  // 一个既有结构候选可覆盖多个字段；映射不新增模型请求或候选 owner。
  const results=new Map<string,z.infer<typeof outputConversionReceiptItem>>();
  for(const item of value.items) {
    const prior=results.get(item.resultId);
    if(prior && (prior.taskId!==item.taskId || prior.status!==item.status || prior.errorCode!==item.errorCode))
      issue("同一结果的任务、状态及错误回执必须一致",["items"]);
    results.set(item.resultId,item);
  }
  const allowed:readonly string[]=allowedFields[value.targetType];
  if(value.targetFields.some(field=>!allowed.includes(field)) || fields.some(field=>!allowed.includes(field)))
    issue("目标字段不属于目标作品类型",["targetFields"]);
  const sameFields=(left:readonly string[],right:readonly string[])=>left.length===right.length && left.every(field=>right.includes(field));
  if(!sameFields(fields,value.targetFields))issue("所有授权目标字段必须具有独立回执",["items"]);
  if(request.mode==="selected" && !sameFields(request.targetFields,value.targetFields))issue("回执遗漏或扩张局部授权字段",["targetFields"]);
  if(request.mode==="whole" && wholeRequiredFields[value.targetType].some(field=>!value.targetFields.includes(field)))
    issue("整稿缺少必要目标结构",["targetFields"]);
  const primary=value.items.find(item=>item.resultId===value.resultId);
  if(!primary || primary.taskId!==value.taskId)issue("primary 结果/任务必须指向同一真实单项",["resultId"]);
  if(results.size>1 && !value.bundleId)issue("多个真实结果须具有既有 bundle 账本引用",["bundleId"]);
  if(value.bundleId && value.items.some(item=>item.resultId===value.bundleId))issue("bundleId 不得冒充 resultId",["bundleId"]);
  // SEMANTIC_BOUNDARY_ALLOW: 完全沿现有 creative-results 的状态聚合，仅核验回执，不决定创作取舍。
  const statuses=value.items.map(item=>item.status);
  const succeeded=(status:string)=>status==="succeeded" || status==="adopted";
  const failed=(status:string)=>status==="failed" || status==="cancelled";
  const aggregate=statuses.every(status=>status==="queued")?"queued":
    statuses.every(status=>status==="cancelled")?"cancelled":
    statuses.every(succeeded)?"complete":statuses.every(failed)?"failed":
    statuses.some(succeeded) && statuses.some(failed)?"partial_completed":"running";
  if(value.status!==aggregate)issue("聚合状态与单项回执不一致",["status"]);
});
export type OutputConversionRequest = z.infer<typeof outputConversionRequest>;
export type OutputConversionSourceAnchor = z.infer<typeof outputConversionSourceAnchor>;
export type OutputConversionReceipt = z.infer<typeof outputConversionReceipt>;
