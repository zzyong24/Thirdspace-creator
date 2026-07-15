/**
 * [T-326 ENG-H02] `next build` 阶段守卫 —— 真实代码路径测试(非复制逻辑):
 * 走导出的 service getter(它们全部经组合根唯一入口 getBundle()),证明:
 *   · NEXT_PHASE=phase-production-build(Next 16 在 build/index.js 设置、预渲染 worker
 *     继承的官方信号)下,任何持久层入口都被 PersistenceUnavailableDuringBuildError 拒绝
 *     —— buildPersistence 完全不执行:不建 DB 连接、不 seed、不 sweep、不启 cron。
 *   · 拒绝是**同步 throw 先于单例缓存赋值**:build 阶段的调用不会把 rejected promise
 *     钉进 globalThis 单例 —— 同进程随后的运行时调用(NEXT_PHASE 清掉后)照常构造。
 *
 * 「不建 DB」的判据:守卫在 getBundle() 里先于 buildPersistence() 抛出;本测试同时用
 * 「守卫拒绝后,恢复运行时 env 能正常构造出 bundle」证明拒绝路径没有留下任何半初始化状态
 * (若 build 阶段真建过连接/singleton,后一步会命中同一 globalThis 缓存而非重新构造)。
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  getIdentityService,
  getPlatformAccountService,
  PersistenceUnavailableDuringBuildError,
  __resetPersistenceForTests,
} from "@/server/persistence-client";

const ORIGINAL_NEXT_PHASE = process.env.NEXT_PHASE;

afterEach(() => {
  if (ORIGINAL_NEXT_PHASE === undefined) {
    delete process.env.NEXT_PHASE;
  } else {
    process.env.NEXT_PHASE = ORIGINAL_NEXT_PHASE;
  }
  __resetPersistenceForTests();
});

describe("[T-326 ENG-H02] next build 阶段禁止触碰持久层", () => {
  it("phase-production-build 下所有持久层入口同一拒绝(不构造 bundle)", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    await expect(getIdentityService()).rejects.toBeInstanceOf(
      PersistenceUnavailableDuringBuildError,
    );
    await expect(getPlatformAccountService()).rejects.toBeInstanceOf(
      PersistenceUnavailableDuringBuildError,
    );
  });

  it("其他 NEXT_PHASE 值(dev/start)不受影响 —— 运行时行为不变", async () => {
    // phase-development-server = next dev;守卫只认 production build 这一个值。
    process.env.NEXT_PHASE = "phase-development-server";
    const identity = await getIdentityService();
    expect(identity).toBeTruthy();
    // 单机免登录直通依赖启动 seed 的 canonical user —— 证明 seed 在运行时照常发生。
    const ctx = await identity.resolveLocalContext();
    expect(ctx.userId).toBeTruthy();
  }, 120_000);

  it("build 阶段被拒后不留半初始化单例:恢复运行时 env 可正常构造", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    await expect(getIdentityService()).rejects.toBeInstanceOf(
      PersistenceUnavailableDuringBuildError,
    );
    delete process.env.NEXT_PHASE;
    // 若 build 期调用曾把 rejected promise 钉进 globalThis,这里会再次 reject。
    const identity = await getIdentityService();
    expect(identity).toBeTruthy();
  }, 120_000);
});
