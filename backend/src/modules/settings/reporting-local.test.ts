import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, decryptSecret, sql, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createReportingLocal } from "./reporting-local";

const key=Buffer.alloc(32,7);
const at="2026-09-29T12:00:00.000Z";
const owner:RequestContext={userId:"u-a",requestId:"r-a",source:"user",accountId:"a"};
const other:RequestContext={userId:"u-b",requestId:"r-b",source:"user",accountId:"b"};
const accounts=[
  {id:"a",userId:"u-a",accountHandle:"主号",platform:"douyin",status:"active"},
  {id:"b",userId:"u-b",accountHandle:"其他人的号",platform:"douyin",status:"active"},
];
const works=[
  {id:"public",accountId:"a",platform:"douyin",status:"published",hiddenAt:null,removedAt:null,platformStatus:"已通过",publishedAt:at},
  {id:"private",accountId:"a",platform:"douyin",status:"published",hiddenAt:at,removedAt:null,platformStatus:"已通过",publishedAt:at},
  {id:"other",accountId:"b",platform:"douyin",status:"published",hiddenAt:null,removedAt:null,platformStatus:"已通过",publishedAt:at},
];
const snapshots=[
  {id:"snap-public",publicationId:"public",accountId:"a",capturedAt:at,source:"ingestion",rawMetrics:{views:0,likes:4,comments:1,shares:0,title:"PRIVATE",cookie:"PRIVATE"}},
  {id:"snap-private",publicationId:"private",accountId:"a",capturedAt:at,source:"ingestion",rawMetrics:{views:200}},
  {id:"snap-other",publicationId:"other",accountId:"b",capturedAt:at,source:"ingestion",rawMetrics:{views:900}},
];

describe("T-1024 CreatorOS local reporting",()=>{
  let db:Db;
  let close:()=>Promise<void>;
  let reporting:ReturnType<typeof createReportingLocal>;
  let workRows:typeof works;
  let accountRows:typeof accounts;
  beforeEach(async()=>{
    const opened=await createDb();db=opened.db;close=()=>opened.client.close();
    workRows=works.map(w=>({...w}));
    accountRows=accounts.map(a=>({...a}));
    reporting=createReportingLocal(db,key,{
      async getAccount(ctx,id){const row=accountRows.find(a=>a.id===id&&a.userId===ctx.userId);if(!row)throw Error("NOT_FOUND");return row;},
      async listAccounts(ctx,{limit,offset}){const mine=accountRows.filter(a=>a.userId===ctx.userId);return {rows:mine.slice(offset,offset+limit),total:mine.length};},
      async listWorks(ctx,{limit,offset}){return workRows.filter(w=>w.accountId===ctx.accountId).slice(offset,offset+limit);},
      async latestSnapshots(ctx,ids){return snapshots.filter(s=>s.accountId===ctx.accountId&&ids.includes(s.publicationId));},
    },()=>at);
  });
  afterEach(async()=>{await close();});

  it("starts with suggested preference but no effective consent, queue or upload",async()=>{
    const status=await reporting.status(owner);
    expect(status.diagnostics.enabled).toBe(false);
    expect(status.diagnostics.changedAt).toBeNull();
    expect(status.accounts[0]?.enabled).toBe(false);
    expect(status.uploadAvailable).toBe(false);
    expect(await reporting.captureAccountMetrics(owner,"a")).toBe(0);
    expect((await db.execute(sql`SELECT * FROM reporting_outbox`)).rows).toHaveLength(0);
  });

  it("cannot grant consent when durable encryption is unavailable",async()=>{
    const unavailable=createReportingLocal(db,null,{
      async getAccount(){return {id:"a",accountHandle:"主号",platform:"douyin",status:"active"};},
      async listAccounts(){return {rows:[],total:0};},
      async listWorks(){return [];},async latestSnapshots(){return []},
    },()=>at);
    expect((await unavailable.status(owner)).preparationAvailable).toBe(false);
    await expect(unavailable.setConsent(owner,{scope:"diagnostics",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()})).rejects.toThrow("REPORTING_ENCRYPTION_UNAVAILABLE");
    expect((await unavailable.status(owner)).diagnostics.enabled).toBe(false);
  });

  it("requires exact account ownership, scope and consent version",async()=>{
    await expect(reporting.setConsent(owner,{scope:"creator",accountId:"b",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()})).rejects.toThrow("NOT_FOUND");
    await expect(reporting.setConsent(owner,{scope:"diagnostics",accountId:"a",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()})).rejects.toThrow("REPORTING_DIAGNOSTICS_HAS_NO_ACCOUNT");
    await expect(reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:true,consentVersion:0,consentChangeId:crypto.randomUUID()})).rejects.toThrow("REPORTING_CONSENT_VERSION_MISMATCH");
    expect((await db.execute(sql`SELECT * FROM reporting_consents`)).rows).toHaveLength(0);
  });

  it("captures only public owned works, encrypts whitelist, preserves true zero and missing values",async()=>{
    await reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
    expect(await reporting.captureAccountMetrics(owner,"a")).toBe(1);
    expect(await reporting.captureAccountMetrics(owner,"a")).toBe(0);
    const rows=(await db.execute(sql`SELECT encrypted_payload FROM reporting_outbox WHERE user_id='u-a'`)).rows as Array<{encrypted_payload:string}>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.encrypted_payload.startsWith("enc:v1:")).toBe(true);
    const event=JSON.parse(decryptSecret(rows[0]!.encrypted_payload,key));
    expect(event.metrics.plays).toEqual({status:"available",value:0});
    expect(event.metrics.likes).toEqual({status:"available",value:4});
    expect(event.metrics.favorites).toEqual({status:"unavailable",value:null});
    expect(event.metrics.follower_count).toBeUndefined();
    expect(JSON.stringify(event)).not.toMatch(/PRIVATE|public|private|u-a|cookie|title/);
    await expect(reporting.captureAccountMetrics(other,"a")).rejects.toThrow("NOT_FOUND");
  });

  it("keeps diagnostics separate and idempotent; a repeated change id cannot mutate epoch",async()=>{
    const id=crypto.randomUUID();
    await reporting.setConsent(owner,{scope:"diagnostics",enabled:true,consentVersion:1,consentChangeId:id});
    const first=await reporting.status(owner);
    await reporting.setConsent(owner,{scope:"diagnostics",enabled:true,consentVersion:1,consentChangeId:id});
    expect((await reporting.status(owner)).diagnostics.consentEpoch).toBe(first.diagnostics.consentEpoch);
    await expect(reporting.setConsent(owner,{scope:"diagnostics",enabled:false,consentVersion:1,consentChangeId:id})).rejects.toThrow("REPORTING_CHANGE_ID_CONFLICT");
    expect(await reporting.captureDiagnostic(owner,"collection_failed","ref_123",at)).toBe(true);
    expect(await reporting.captureDiagnostic(owner,"collection_failed","ref_123",at)).toBe(false);
    expect(await reporting.captureDiagnostic(owner,"collection_failed","/tmp/secret",at)).toBe(false);
    expect((await reporting.status(owner)).accounts[0]?.enabled).toBe(false);
  });

  it("revokes locally before any later capture and clears only its own scope",async()=>{
    await reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
    await reporting.setConsent(owner,{scope:"diagnostics",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
    await reporting.captureAccountMetrics(owner,"a");
    await reporting.captureDiagnostic(owner,"collection_failed","ref_123",at);
    await reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:false,consentVersion:1,consentChangeId:crypto.randomUUID()});
    expect(await reporting.captureAccountMetrics(owner,"a")).toBe(0);
    expect((await reporting.status(owner)).accounts[0]?.queuedCount).toBe(0);
    expect((await reporting.status(owner)).diagnostics.queuedCount).toBe(1);
  });

  it("removes a previously queued public work when it becomes hidden",async()=>{
    await reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
    expect(await reporting.captureAccountMetrics(owner,"a")).toBe(1);
    workRows=workRows.map(w=>w.id==="public"?{...w,hiddenAt:at}:w);
    expect(await reporting.captureAccountMetrics(owner,"a")).toBe(0);
    expect((await reporting.status(owner)).accounts[0]?.queuedCount).toBe(0);
  });

  it("records truthful account run state without inventing follower totals",async()=>{
    await reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
    expect(await reporting.captureAccountState(owner,"a","needs_reconnect","task_123",at)).toBe(true);
    const row=(await db.execute(sql`SELECT encrypted_payload FROM reporting_outbox WHERE user_id='u-a'`)).rows[0] as {encrypted_payload:string};
    const event=JSON.parse(decryptSecret(row.encrypted_payload,key));
    expect(event.state).toBe("needs_reconnect");
    expect(event.followerCount).toEqual({status:"unavailable",value:null,source:null,capturedAt:null});
    expect(JSON.stringify(event)).not.toContain("主号");
  });

  it("prevents enabling an archived account while allowing its grant to be revoked",async()=>{
    await reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
    accountRows=accountRows.map(a=>a.id==="a"?{...a,status:"archived"}:a);
    expect((await reporting.status(owner)).accounts[0]?.accountActive).toBe(false);
    await expect(reporting.captureAccountMetrics(owner,"a")).rejects.toThrow("REPORTING_ACCOUNT_INACTIVE");
    await reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:false,consentVersion:1,consentChangeId:crypto.randomUUID()});
    expect((await reporting.status(owner)).accounts[0]?.enabled).toBe(false);
    await expect(reporting.setConsent(owner,{scope:"creator",accountId:"a",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()})).rejects.toThrow("REPORTING_ACCOUNT_INACTIVE");
  });

  it("keeps a granted encrypted queue across a local database restart",async()=>{
    const dir=await mkdtemp(join(tmpdir(),"creatoros-reporting-"));
    const ports={
      async getAccount(){throw Error("NOT_FOUND");},
      async listAccounts(){return {rows:[],total:0};},
      async listWorks(){return [];},
      async latestSnapshots(){return [];},
    };
    let first:Awaited<ReturnType<typeof createDb>>|null=null;
    let second:Awaited<ReturnType<typeof createDb>>|null=null;
    try {
      first=await createDb({dataDir:dir});
      const local=createReportingLocal(first.db,key,ports,()=>at);
      await local.setConsent(owner,{scope:"diagnostics",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
      await local.captureDiagnostic(owner,"operation_failed","ref_123",at);
      await first.client.close();first=null;
      second=await createDb({dataDir:dir});
      const restored=createReportingLocal(second.db,key,ports,()=>at);
      expect((await restored.status(owner)).diagnostics).toMatchObject({enabled:true,queuedCount:1});
      const row=(await second.db.execute(sql`SELECT encrypted_payload FROM reporting_outbox`)).rows[0] as {encrypted_payload:string};
      expect(JSON.parse(decryptSecret(row.encrypted_payload,key)).referenceId).toBe("ref_123");
    } finally {
      await first?.client.close();await second?.client.close();await rm(dir,{recursive:true,force:true});
    }
  });

  it("expires locally queued data after seven days",async()=>{
    await reporting.setConsent(owner,{scope:"diagnostics",enabled:true,consentVersion:1,consentChangeId:crypto.randomUUID()});
    expect(await reporting.captureDiagnostic(owner,"operation_failed","ref_expire",at)).toBe(true);
    const later=createReportingLocal(db,key,{
      async getAccount(){throw Error("NOT_FOUND");},
      async listAccounts(){return {rows:[],total:0};},
      async listWorks(){return [];},
      async latestSnapshots(){return [];},
    },()=>"2026-10-07T12:00:00.001Z");
    expect((await later.status(owner)).diagnostics.queuedCount).toBe(0);
    expect((await db.execute(sql`SELECT event_id FROM reporting_outbox`)).rows).toHaveLength(0);
  });
});
