import { describe, it, expect } from "vitest";
import {
  classifyLoopType,
  isAgenticTaskType,
  assertLoopType,
  LoopTypeMismatchError,
} from "./loop-type";
import { createExecutorRegistry } from "../executor-registry";

// [T-256b] 判定规则纯函数 + register/create 真 gate(SPEC §8 gate-m1)。

describe("classifyLoopType(纯函数判定)", () => {
  it("agentic.* → agentic(含 exec. 前缀剥壳)", () => {
    expect(classifyLoopType("agentic.research")).toBe("agentic");
    expect(classifyLoopType("agentic.collect")).toBe("agentic");
    expect(classifyLoopType("agentic.material")).toBe("agentic");
    expect(classifyLoopType("exec.agentic.research")).toBe("agentic");
  });

  it("chat / chat.* → conversation", () => {
    expect(classifyLoopType("chat")).toBe("conversation");
    expect(classifyLoopType("chat.turn")).toBe("conversation");
  });

  it("确定性任务(脚本/采集/渲染)→ deterministic", () => {
    expect(classifyLoopType("echo.manifest")).toBe("deterministic");
    expect(classifyLoopType("video.render")).toBe("deterministic");
    expect(classifyLoopType("exec.video.render")).toBe("deterministic");
    expect(classifyLoopType("scheduled.self.metrics")).toBe("deterministic");
    expect(classifyLoopType("asset.generate")).toBe("deterministic");
  });

  it("isAgenticTaskType 与判定一致", () => {
    expect(isAgenticTaskType("agentic.research")).toBe(true);
    expect(isAgenticTaskType("exec.agentic.collect")).toBe(true);
    expect(isAgenticTaskType("video.render")).toBe(false);
  });
});

describe("assertLoopType(真 gate)", () => {
  it("匹配放行,不匹配抛 LoopTypeMismatchError", () => {
    expect(() => assertLoopType("agentic.research", "agentic")).not.toThrow();
    expect(() => assertLoopType("video.render", "deterministic")).not.toThrow();
    expect(() => assertLoopType("agentic.research", "deterministic")).toThrow(
      LoopTypeMismatchError,
    );
    expect(() => assertLoopType("video.render", "agentic")).toThrow(
      LoopTypeMismatchError,
    );
  });
});

describe("executor-registry 注册期结构门", () => {
  const noop = {
    async run() {
      return {};
    },
  };

  it("agentic 名挂确定性壳(未声明 loopType)→ 拒注册", () => {
    const reg = createExecutorRegistry();
    expect(() =>
      reg.register({ taskType: "agentic.research" as never, ...noop }),
    ).toThrow(LoopTypeMismatchError);
  });

  it("确定性名挂 agentic 声明 → 拒注册", () => {
    const reg = createExecutorRegistry();
    expect(() =>
      reg.register({
        taskType: "video.render" as never,
        loopType: "agentic",
        ...noop,
      }),
    ).toThrow(LoopTypeMismatchError);
  });

  it("命名与声明一致 → 放行 + loopTypeOf 可查", () => {
    const reg = createExecutorRegistry();
    reg.register({ taskType: "echo.manifest" as never, ...noop });
    reg.register({
      taskType: "agentic.research" as never,
      loopType: "agentic",
      ...noop,
    });
    expect(reg.loopTypeOf("echo.manifest")).toBe("deterministic");
    expect(reg.loopTypeOf("agentic.research")).toBe("agentic");
    expect(reg.loopTypeOf("unknown.type")).toBeNull();
  });
});
