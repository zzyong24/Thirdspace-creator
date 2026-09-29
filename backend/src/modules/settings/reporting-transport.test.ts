import { afterEach,beforeEach,describe,expect,it } from "vitest";
import { createDb } from "@creatoros/backend";
import { createClient,ENDPOINTS,type RequestContext } from "@creatoros/contract";
import { createReportingLocal } from "./reporting-local";
import { createSettingsTransport,SETTINGS_OP_IDS } from "./settings.transport";
import type { SettingsService } from "./settings.service";

const ctx:RequestContext={userId:"u",accountId:"a",requestId:"req-1",source:"user"};
describe("T-1024 reporting dispatch contract",()=>{
  let close:()=>Promise<void>;
  let client:ReturnType<typeof createClient<typeof ENDPOINTS>>;
  let transport:ReturnType<typeof createSettingsTransport>;
  beforeEach(async()=>{
    const opened=await createDb();close=()=>opened.client.close();
    const local=createReportingLocal(opened.db,Buffer.alloc(32,1),{
      async getAccount(_ctx,id){if(id!=="a")throw Error("NOT_FOUND");return {id:"a",accountHandle:"主号",platform:"douyin",status:"active"};},
      async listAccounts(){return {rows:[{id:"a",accountHandle:"主号",platform:"douyin",status:"active"}],total:1};},
      async listWorks(){return [];},async latestSnapshots(){return []},
    },()=>"2026-09-29T12:00:00Z");
    transport=createSettingsTransport(()=>({} as SettingsService),undefined,undefined,local);
    client=createClient(ENDPOINTS,transport,ctx);
  });
  afterEach(async()=>{await close();});
  it("registers real get/set/clear operations and never grants by reading",async()=>{
    expect(SETTINGS_OP_IDS).toContain("settings.reporting.get");
    expect(SETTINGS_OP_IDS).toContain("settings.reporting.consent.set");
    expect(SETTINGS_OP_IDS).toContain("settings.reporting.pending.clear");
    const before=await client.getReportingStatus({params:undefined,query:undefined,body:undefined});
    expect(before.accounts[0]).toMatchObject({enabled:false,accountActive:true});
    const after=await client.setReportingConsent({params:undefined,query:undefined,body:{scope:"creator",accountId:"a",enabled:true,consentVersion:1,consentChangeId:"00000000-0000-4000-8000-000000000001"}});
    expect(after.accounts[0]).toMatchObject({enabled:true,consentEpoch:1});
    const clear=await client.clearReportingPending({params:undefined,query:undefined,body:{scope:"creator",accountId:"a"}});
    expect(clear.accounts[0]?.enabled).toBe(true);
  });
  it("rejects malformed or extra consent fields at the server transport boundary",async()=>{
    const valid={params:undefined,query:undefined,body:{scope:"diagnostics",enabled:true,consentVersion:1,consentChangeId:"00000000-0000-4000-8000-000000000001"}};
    await expect(transport.request(ENDPOINTS.setReportingConsent,{...valid,body:{...valid.body,enabled:"false"}} as never,ctx)).rejects.toThrow();
    await expect(transport.request(ENDPOINTS.setReportingConsent,{...valid,body:{...valid.body,cookie:"secret"}} as never,ctx)).rejects.toThrow();
    expect((await client.getReportingStatus({params:undefined,query:undefined,body:undefined})).diagnostics.enabled).toBe(false);
  });
});
