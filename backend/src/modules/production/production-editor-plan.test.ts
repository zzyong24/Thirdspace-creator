import { describe, expect, it } from "vitest";
import { prepareEditorPlan, applyEditorEdits, itemDigest } from "./production-editor-plan";

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
});
