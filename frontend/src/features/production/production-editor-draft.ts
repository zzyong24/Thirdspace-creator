import type {VideoRenderProps,VideoRenderCard,VideoRenderBroll,VideoRenderCaption} from "@creatoros/contract";

export type DraftPlan=Record<string,unknown>&{renderProps:VideoRenderProps};
export type DraftItem={id:string;kind:"caption"|"card"|"broll";start:number;end:number;label:string;sceneId?:string};
export function listDraftItems(plan:DraftPlan):DraftItem[] {
  const p=plan.renderProps;
  return [
    ...p.captions.flatMap(c=>c.id?[{id:c.id,kind:"caption" as const,start:c.start,end:c.end,label:c.cn}]:[]),
    ...p.scenes.flatMap(s=>s.cards.flatMap(c=>c.id?[{id:c.id,kind:"card" as const,start:c.at,end:s.endSec,sceneId:s.id,label:cardLabel(c)}]:[])),
    ...p.broll.flatMap(b=>b.id?[{id:b.id,kind:"broll" as const,start:b.at,end:b.at+(b.durationSec??Math.max(.1,(p.scenes.find(s=>b.at>=s.startSec&&b.at<s.endSec)?.endSec??p.talkingHead.durationSec)-b.at)),label:b.label}]:[]),
  ];
}
function cardLabel(c:VideoRenderCard):string {
  switch(c.kind){case "stat":return c.label;case "quote":return c.text;case "list":return c.title??c.items.map(i=>i.text).join("／");case "compare":return `${c.left.title}／${c.right.title}`;case "code":return c.label??c.code;case "image":return c.label;}
}
// SEMANTIC_BOUNDARY_ALLOW: 按稳定ID执行用户字段与时间修改，不匹配文本或推断画面内容。
export function patchDraftItem(plan:DraftPlan,itemId:string,patch:Record<string,unknown>):DraftPlan {
  const next=structuredClone(plan),p=next.renderProps;
  const cap=p.captions.find(c=>c.id===itemId);if(cap){Object.assign(cap,patch);if("cn" in patch || "start" in patch || "end" in patch)delete cap.emphasis;return next;}
  const b=p.broll.find(c=>c.id===itemId);if(b){Object.assign(b,patch);return next;}
  for(const s of p.scenes){const card=s.cards.find(c=>c.id===itemId);if(card){Object.assign(card,patch);return next;}}
  throw new Error("当前片段已不存在，请重新选择");
}
export function removeDraftItem(plan:DraftPlan,itemId:string):DraftPlan {
  const next=structuredClone(plan),p=next.renderProps;p.captions=p.captions.filter(c=>c.id!==itemId);p.broll=p.broll.filter(c=>c.id!==itemId);for(const s of p.scenes)s.cards=s.cards.filter(c=>c.id!==itemId);return next;
}
export function moveDraftItem(plan:DraftPlan,item:DraftItem,start:number,end:number):DraftPlan {
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>plan.renderProps.talkingHead.durationSec+.001)throw new Error("片段时间需要在视频范围内，结束时间应晚于开始时间");
  if(item.kind==="caption")return patchDraftItem(plan,item.id,{start,end});
  if(item.kind==="broll")return patchDraftItem(plan,item.id,{at:start,durationSec:end-start});
  const scene=plan.renderProps.scenes.find(s=>s.id===item.sceneId);
  if(!scene || start<scene.startSec || start>=scene.endSec)throw new Error("卡片需要留在所属分场内；分场边界请在备料中调整");
  return patchDraftItem(plan,item.id,{at:start});
}
export function readDraftItem(plan:DraftPlan,id:string):VideoRenderCard|VideoRenderBroll|VideoRenderCaption|undefined {
  return plan.renderProps.captions.find(c=>c.id===id)??plan.renderProps.broll.find(c=>c.id===id)??plan.renderProps.scenes.flatMap(s=>s.cards).find(c=>c.id===id);
}
