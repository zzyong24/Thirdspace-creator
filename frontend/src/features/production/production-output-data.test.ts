import { describe, expect, it, vi } from "vitest";
import { selectProductionOutput, resolveProductionScriptArtifactId } from "./production-output-data";
import type { ScriptDataClient } from "@/features/script/script-editor-data";

const outputs=[{id:"image",contentType:"image"},{id:"article",contentType:"article"},{id:"video-a",contentType:"video"},{id:"video-b",contentType:"video"}];
describe("T-1037 具体视频制作入口",()=>{
  it("混合项目必须明确视频；旧唯一视频入口仍自动定位",()=>{
    expect(selectProductionOutput(outputs).output).toBeNull();
    expect(selectProductionOutput(outputs,"video-b").output?.id).toBe("video-b");
    expect(selectProductionOutput(outputs,"image").invalid).toBe(true);
    expect(selectProductionOutput(outputs,"other-account").output).toBeNull();
    expect(selectProductionOutput(outputs.slice(0,3)).output?.id).toBe("video-a");
  });
  it("指定作品脚本可在首百条之外；另一视频脚本不作为回退",async()=>{
    const listArtifacts=vi.fn(async({query}:{query:{page:number}})=>query.page===1?
      Array.from({length:100},(_,i)=>({id:`other-${i}`,artifactType:"output_script",contentOutputId:"video-a"})):
      [{id:"script-b",artifactType:"output_script",contentOutputId:"video-b"}]);
    const client={listArtifacts} as unknown as ScriptDataClient;
    expect(await resolveProductionScriptArtifactId(client,"project","video-b",false)).toBe("script-b");
    expect(listArtifacts).toHaveBeenCalledTimes(2);
    expect(await resolveProductionScriptArtifactId(client,"project","missing",true)).toBeNull();
  });
});
