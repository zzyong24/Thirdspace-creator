import { describe, expect, it } from "vitest";

import {
  matchesPinnedModelAuthority,
  pinModelAuthority,
  TaskModelAuthorityScope,
} from "./task-model-authority";

describe("T-617 异步任务模型 authority 快照", () => {
  it("同一渠道 payload 不受对象键顺序影响，不同 payload 产生不同 digest", () => {
    const first = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: {
        model: "private-model",
        settings: { temperature: 0.2, topP: 0.9 },
        apiKey: "SECRET_CHANNEL_KEY",
      },
    });
    const reordered = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: {
        apiKey: "SECRET_CHANNEL_KEY",
        settings: { topP: 0.9, temperature: 0.2 },
        model: "private-model",
      },
    });
    const changed = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: {
        model: "other-private-model",
        settings: { temperature: 0.2, topP: 0.9 },
        apiKey: "SECRET_CHANNEL_KEY",
      },
    });

    expect(reordered.digest).toBe(first.digest);
    expect(changed.digest).not.toBe(first.digest);
    const otherScope = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-b",
      payload: {
        model: "private-model",
        settings: { temperature: 0.2, topP: 0.9 },
        apiKey: "SECRET_CHANNEL_KEY",
      },
    });
    expect(otherScope.digest).not.toBe(first.digest);
  });

  it("创建时快照与执行时 authority 不同则 fail-closed", () => {
    const local = pinModelAuthority({
      authority: "local",
      outcome: "unreachable",
      payload: null,
    });
    const channel = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: { model: "private-model" },
    });

    expect(
      matchesPinnedModelAuthority(
        {
          modelAuthority: local.authority,
          modelAuthorityDigest: local.digest,
        },
        channel,
      ),
    ).toBe(false);
  });

  it("执行作用域固定使用通过 digest 校验的 payload，不随外部当前值切换", async () => {
    const scope = new TaskModelAuthorityScope();
    const pinned = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: { model: "private-model" },
    });
    let current = { model: "private-model" };

    await scope.run(pinned, async () => {
      current = { model: "changed-after-queue" };
      await Promise.resolve();
      expect(scope.currentPayload()).toEqual({ model: "private-model" });
      expect(scope.currentScopeId()).toBe("scope-a");
      expect(scope.currentPayload()).not.toEqual(current);
    });
    expect(scope.currentPayload()).toBeUndefined();
    expect(scope.currentScopeId()).toBeUndefined();
  });
});

describe('T1280 冻结引擎进入原任务作用域', () => {
  const local = () => ({authority:'local' as const,outcome:'unreachable' as const,payload:null});
  const route = (engine: 'pi'|'codex') => ({schemaVersion:1,engine,source:'preference',protocolKind:engine==='codex'?'codex-app-server':'pi',...(engine==='codex'?{runtimeVersion:'0.159.3'}:{})});
  it('Codex不读取渠道配置且不继承父级渠道payload，执行后恢复原作用域', async () => {
    const scope=new TaskModelAuthorityScope();let runs=0;
    const parent=pinModelAuthority({authority:'channel',outcome:'configured',scopeId:'parent',payload:{model:'parent-model'}});
    await scope.run(parent,async()=>{
      expect(await scope.runFrozen({executionRoute:route('codex')},async()=>{throw Error('不应读取渠道');},async()=>{runs++;expect(scope.currentPayload()).toBeUndefined();})).toBe(true);
      expect(scope.currentPayload()).toEqual({model:'parent-model'});
    });expect(runs).toBe(1);
  });
  it('Pi完整匹配才执行；变化或缺authority不执行，缺route仍走旧Pi校验', async()=>{
    const scope=new TaskModelAuthorityScope();let runs=0,reads=0;
    const read=async()=>{reads++;return local();},execute=async()=>{runs++;expect(scope.currentPayload()).toBeNull();};
    expect(await scope.runFrozen({executionRoute:route('pi'),modelAuthority:'local',modelAuthorityDigest:'local'},read,execute)).toBe(true);
    expect(await scope.runFrozen({executionRoute:route('pi'),modelAuthority:'channel-managed',modelAuthorityDigest:'old'},read,execute)).toBe(false);
    expect(await scope.runFrozen({},read,execute)).toBe(false);
    expect(await scope.runFrozen({modelAuthority:'local',modelAuthorityDigest:'local'},read,execute)).toBe(true);
    expect(runs).toBe(2);expect(reads).toBe(4);
  });
  it('显式损坏冻结路由不执行也不读取替代配置',async()=>{
    const scope=new TaskModelAuthorityScope();let reads=0,runs=0;
    await expect(scope.runFrozen({executionRoute:{engine:'codex'}},async()=>{reads++;return local();},async()=>{runs++;})).rejects.toThrow();
    expect(reads).toBe(0);expect(runs).toBe(0);
  });
});
