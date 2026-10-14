import { describe, expect, it } from "vitest";
import { videoRenderProps, type VideoRenderProps } from "@creatoros/contract";
import { compileV1RenderProps } from "./production-v1-compile";
import { assertVideoLayoutSafety, generateVideoRenderHtml } from "../execution/video-render/template";

const input = (width = 320, height = 180, hasAudio = true, duration = 2.125) => videoRenderProps.parse({
  meta: { title: "保留原片" }, talkingHead: { file: "owned-source", durationSec: duration, hasAudio },
  scenes: [{ id: "scene", title: "原片", label: "原片", startSec: 0, endSec: duration, cards: [] }],
  captions: [], broll: [], delivery: { width, height, fps: 24 },
});

describe("T1281 纯V1使用既有原片执行路径", () => {
  it.each([[320,180,true],[1920,1080,false]] as const)("%sx%s保原片边界及声音，执行副本不写输入", (width,height,hasAudio) => {
    const props=input(width,height,hasAudio), before=structuredClone(props);
    const compiled=compileV1RenderProps(props);
    expect(compiled.talkingHead.clips).toEqual([{clipId:"legacy-v1-source",file:"owned-source",startSec:0,endSec:2.125,sourceInSec:0,hasAudio}]);
    expect(props).toEqual(before);
    expect({...compiled,talkingHead:props.talkingHead}).toEqual(props);
    expect(()=>assertVideoLayoutSafety(compiled)).not.toThrow();
    const html=generateVideoRenderHtml(compiled);
    expect(html).toContain('data-duration="2.125"');
    expect(html).toContain(`left:0px;top:0px;width:${width}px;height:${height}px`);
    expect(html).toContain('object-fit:contain');
    // 模板用属性是否存在标识音轨，false路径不生成该属性。
    expect(html.includes('data-has-audio="true"')).toBe(hasAudio);
  });
  it("已有视觉、方向、显式布局和竖屏均保持原路径和对象", () => {
    const base=input();
    const variations:VideoRenderProps[]=[
      input(180,320),
      {...base,captions:[{start:0,end:1,cn:"真实字幕"}]},
      {...base,broll:[{file:"overlay",at:0,durationSec:1,label:"已有素材",big:false}]},
      {...base,scenes:[{...base.scenes[0]!,mode:"pip"}]},
      {...base,scenes:[{...base.scenes[0]!,special:{kind:"steps",items:[{label:"一"},{label:"二"}]}}]},
      {...base,scenes:[{...base.scenes[0]!,cards:[{kind:"quote",text:"保留",tone:"accent",at:0}]}]},
      {...base,direction:{} as NonNullable<VideoRenderProps["direction"]>},
      {...base,talkingHead:{...base.talkingHead,clips:[{clipId:"existing",file:"owned-source",startSec:0,endSec:2.125,sourceInSec:0,hasAudio:true}]}},
    ];
    for(const props of variations)expect(compileV1RenderProps(props)).toBe(props);
  });
});
