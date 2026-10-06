import {it,expect,vi,afterEach} from "vitest";
import type {CreationOperation} from "@/lib/creation-workspace-scope";
import {uploadFileForCopilot} from "./upload-to-project";
vi.mock("./ammo-dump-zone",()=>({assignTagsBestEffort:vi.fn(async()=>{})}));
afterEach(()=>vi.unstubAllGlobals());
it("PUT中切组后不complete/link/排新AI，取消仅旧scope（TMP候选，未运行）",async()=>{
  const controller=new AbortController();let active=true;
  const api={createUpload:vi.fn(async()=>({uploadId:"u",uploadUrl:"https://signed.invalid",assetId:"a"})),completeUpload:vi.fn(),createMaterialLink:vi.fn(),createAITask:vi.fn()};
  const operation={scope:{groupId:"g",accountId:null},epoch:0,signal:controller.signal,client:api,assertCurrent:()=>{if(!active)throw new DOMException("切组","AbortError");}} as unknown as CreationOperation;
  vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init:RequestInit)=>{expect(init.signal).toBe(controller.signal);active=false;controller.abort();return new Response(null,{status:200});}));
  await expect(uploadFileForCopilot(new File(["x"],"x.png",{type:"image/png"}),"p",operation)).rejects.toThrow();
  expect(api.completeUpload).not.toHaveBeenCalled();expect(api.createMaterialLink).not.toHaveBeenCalled();expect(api.createAITask).not.toHaveBeenCalled();
});
