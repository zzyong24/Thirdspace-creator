import { describe, expect, it } from "vitest";
import { prepareEditorPlan, applyEditorEdits, itemDigest, unsupportedEditorFields } from "./production-editor-plan";

const legacy = () => ({
  sourceTaskId: "source-task", decisions: { scenes: ["来源说明"] }, extraPlan: { preserve: true },
  renderProps: {
    meta: { title: "制作验证", extraMeta: "保留" }, talkingHead: { file: "master", durationSec: 20 },
    scenes: [{ id: "scene-1", label: "正文", title: "真实段落", startSec: 0, endSec: 20,
      cards: [{ kind: "quote", at: 2, text: "这句可编辑", extraCard: { preserve: true } }] }],
    captions: [{ start: 0, end: 4, cn: "第一句", emphasis: [{text:"第一", startChar:0,endChar:2,startSec:0,endSec:3}] }],
    broll: [{ at: 5, durationSec: 3, file: "same-asset", label: "同素材第一次" },
      { at: 10, durationSec: 3, file: "same-asset", label: "同素材第二次" }],
    unknownRoot: { preserve: true },
  },
});
function prepare() { let n = 0; return prepareEditorPlan(legacy(), () => `item-${++n}`); }

describe("T-1037 稳定制作片段与结构编辑", () => {
  it("明确保存时分配身份，保留旧原件与未知嵌套字段", () => {
    const input = legacy(); let n = 0; const plan = prepareEditorPlan(input, () => `item-${++n}`);
    expect(input).toEqual(legacy()); expect(plan.editorVersion).toBe(1);
    expect(plan.renderProps.broll[0]!.id).not.toBe(plan.renderProps.broll[1]!.id);
    expect(plan.renderProps.meta.extraMeta).toBe("保留");
    expect(plan.renderProps.scenes[0]!.cards[0]!.extraCard).toEqual({preserve:true});
    expect(plan.renderProps.unknownRoot).toEqual({preserve:true});
    expect(prepareEditorPlan(plan, () => {throw new Error("不应重新分配");})).toEqual(plan);
  });
  it("未知方案与嵌套字段可见但不执行，读取不改变原件",()=>{
    const raw=legacy(),before=structuredClone(raw);
    expect(unsupportedEditorFields(raw)).toEqual(expect.arrayContaining(["extraPlan","renderProps.unknownRoot","renderProps.meta.extraMeta","renderProps.scenes.0.cards.0.extraCard"]));
    expect(raw).toEqual(before);
  });
  it("同素材两次插入，只移除指定身份，不全局排除源素材", () => {
    const plan = prepare(), target = plan.renderProps.broll[0]!;
    const updated = applyEditorEdits(plan, [{type:"removeItem",itemId:target.id,expectedItemDigest:itemDigest(target)}]);
    expect(updated.renderProps.broll).toEqual([plan.renderProps.broll[1]!]);
    expect(updated.excludedAssetIds).toBeUndefined(); expect(plan.renderProps.broll).toHaveLength(2);
  });
  it("变更字幕只清理本项不再成立的重点，不编造新重点", () => {
    const plan = prepare(), target = plan.renderProps.captions[0]!;
    const updated = applyEditorEdits(plan,[{type:"updateCaption",itemId:target.id,expectedItemDigest:itemDigest(target),patch:{cn:"换成新的原句"}}]);
    expect(updated.renderProps.captions[0]!.cn).toBe("换成新的原句");
    expect(updated.renderProps.captions[0]!.emphasis).toBeUndefined();
    expect(updated.renderProps.broll).toEqual(plan.renderProps.broll);
  });
  it("不改文字和时间时保留重点；移动素材保持身份及未知字段", () => {
    const plan=prepare(), caption=plan.renderProps.captions[0]!, target=plan.renderProps.broll[1]!;
    const updated=applyEditorEdits(plan,[{type:"updateCaption",itemId:caption.id,expectedItemDigest:itemDigest(caption),patch:{en:"First"}},
      {type:"updateBroll",itemId:target.id,expectedItemDigest:itemDigest(target),patch:{at:12,durationSec:4}}]);
    expect(updated.renderProps.captions[0]!.emphasis).toEqual(caption.emphasis);
    expect(updated.renderProps.broll[1]!.id).toBe(target.id);
    expect(updated.renderProps.broll[1]!.at).toBe(12);
  });
  it("整批有一个过期目标或越界就零变更", () => {
    const plan=prepare(), original=structuredClone(plan), target=plan.renderProps.broll[0]!;
    expect(()=>applyEditorEdits(plan,[{type:"removeItem",itemId:target.id,expectedItemDigest:itemDigest(target)},
      {type:"updateSceneTitle",itemId:"scene-1",expectedItemDigest:"sha256:"+"0".repeat(64),title:"新标题"}])).toThrow();
    expect(plan).toEqual(original);
    expect(()=>applyEditorEdits(plan,[{type:"updateBroll",itemId:target.id,expectedItemDigest:itemDigest(target),patch:{at:19,durationSec:3}}])).toThrow();
    expect(plan).toEqual(original);
  });
  it("只改字幕文字不因旧合法素材超出结尾而整单失败", () => {
    const raw=legacy();raw.renderProps.broll[1]!.durationSec=15;
    let n=0;const plan=prepareEditorPlan(raw,()=>`item-${++n}`), caption=plan.renderProps.captions[0]!;
    const updated=applyEditorEdits(plan,[{type:"updateCaption",itemId:caption.id,expectedItemDigest:itemDigest(caption),patch:{cn:"新的字幕原句"}}]);
    expect(updated.renderProps.broll).toEqual(plan.renderProps.broll);
    expect(updated.renderProps.captions[0]!.cn).toBe("新的字幕原句");
  });
  it("已有新稿重号、未知编辑类型、跨类型更新都明确失败", () => {
    const plan=prepare();plan.renderProps.broll[1]!.id=plan.renderProps.broll[0]!.id;
    expect(()=>prepareEditorPlan(plan,()=>"new")).toThrow();
    const current=prepare(), target=current.renderProps.broll[0]!;
    expect(()=>applyEditorEdits(current,[{type:"eval",itemId:target.id,code:"任意代码"} as never])).toThrow();
    expect(()=>applyEditorEdits(current,[{type:"updateCaption",itemId:target.id,expectedItemDigest:itemDigest(target),patch:{cn:"不应写入"}}])).toThrow();
  });
  it("旧方向引用转为片段身份，删除卡片不因序号变化指向另一项", () => {
    const raw=legacy();raw.renderProps.broll=[];
    raw.renderProps.scenes[0]!.cards.push({kind:"quote",at:8,text:"第二张",extraCard:{preserve:true}});
    const beat=(id:string,ref:string,startSec:number,endSec:number)=>({id,sceneIdx:0,startSec,endSec,subject:{kind:"card",ref},startState:"off_canvas",endState:"takeover",motionVerb:"reveal",stageMode:"takeover",transitionIn:"cut",transitionOut:"cut",returnGeometry:"same_base"});
    const source={...raw,renderProps:{...raw.renderProps,direction:{motionThesis:"保留既有方向",beatGraph:[beat("first","card:0:0",2,5),beat("second","card:0:1",8,11)]}}};
    let n=0;const plan=prepareEditorPlan(source,()=>`item-${++n}`), first=plan.renderProps.scenes[0]!.cards[0]!,second=plan.renderProps.scenes[0]!.cards[1]!;
    expect(plan.renderProps.direction!.beatGraph[1]!.subject.ref).toBe(`card:${second.id}`);
    const updated=applyEditorEdits(plan,[{type:"removeItem",itemId:first.id,expectedItemDigest:itemDigest(first)}]);
    expect(updated.renderProps.direction!.beatGraph).toHaveLength(1);
    expect(updated.renderProps.direction!.beatGraph[0]!.subject.ref).toBe(`card:${second.id}`);
  });
  it("更新卡片只补明确输入，省略样式不重置已选色调",()=>{
    const p=prepare(),target=p.renderProps.scenes[0]!.cards[0]!;
    target.tone="danger";
    const next=applyEditorEdits(p,[{type:"updateCard",itemId:target.id,expectedItemDigest:itemDigest(target),card:{kind:"quote",at:target.at,text:"修改原句"}} as never]);
    expect(next.renderProps.scenes[0]!.cards[0]!.tone).toBe("danger");
    expect(next.renderProps.scenes[0]!.cards[0]!.extraCard).toEqual({preserve:true});
  });
});
