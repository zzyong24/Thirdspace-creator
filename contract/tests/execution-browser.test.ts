import { expect, it } from "vitest";
import {
  browserAuthorizationSnapshotSchema as authorization,
  browserObserveInputSchema as observe,
  browserActInputSchema as act,
  browserObservationSchema as observation,
} from "../src/internal/execution-browser";
const base = { sessionId: "session", observationId: "observation" };
it("观察可以仅引用已有会话；首次URL仍需宿主验证", () => {
  expect(observe.parse({ sessionId: "session" })).toEqual({
    sessionId: "session",
  });
  expect(
    observe.parse({ sessionId: "session", url: "https://example.com/page" })
      .url,
  ).toBe("https://example.com/page");
});
it.each([
  { action: "navigate", value: "https://example.com/next" },
  { action: "click", targetRef: "e1" },
  { action: "fill", targetRef: "e1", value: "" },
  { action: "wait", targetRef: "e1" },
  { action: "wait", value: "https://example.com/ready" },
  { action: "extract" },
  { action: "extract", targetRef: "e1" },
])("接受明确受限动作 %j", (input) =>
  expect(act.safeParse({ ...base, ...input }).success).toBe(true),
);
it.each([
  { action: "navigate" },
  { action: "navigate", value: "javascript:alert(1)" },
  { action: "navigate", value: "https://example.com", targetRef: "e1" },
  { action: "click" },
  { action: "click", targetRef: "e1", value: "x" },
  { action: "fill", targetRef: "e1" },
  { action: "wait" },
  { action: "wait", value: "1000" },
  { action: "wait", targetRef: "e1", value: "https://example.com" },
  { action: "extract", value: "document.cookie" },
  { action: "evaluate", value: "1" },
  { action: "click", targetRef: "e1", selector: "#submit" },
  { action: "click", targetRef: "e1", ownerId: "user" },
  { action: "fill", targetRef: "e1", value: "x".repeat(8193) },
])("拒绝不完整或越界动作 %j", (input) =>
  expect(act.safeParse({ ...base, ...input }).success).toBe(false),
);
it.each([
  "file:///etc/passwd",
  "javascript:alert(1)",
  "ftp://example.com",
  "https://user:secret@example.com",
])("观察拒绝危险协议或内嵌凭据 %s", (url) =>
  expect(observe.safeParse({ sessionId: "session", url }).success).toBe(false),
);
it("观察只包含有界事实及不重复引用", () => {
  const data = {
    ...base,
    url: "https://example.com",
    title: "标题",
    text: "正文",
    elements: [{ targetRef: "e1", role: "button", name: "打开" }],
  };
  expect(observation.parse(data)).toEqual(data);
  for (const patch of [
    { text: "x".repeat(12001) },
    { title: "x".repeat(2049) },
    { sessionId: "x".repeat(129) },
    {
      elements: Array.from({ length: 201 }, (_, i) => ({
        targetRef: `e${i}`,
        role: "button",
        name: "打开",
      })),
    },
    { elements: [data.elements[0], data.elements[0]] },
    { elements: [{ ...data.elements[0], selector: "#x" }] },
    { ownerId: "self" },
    { script: "document.cookie" },
  ])
    expect(observation.safeParse({ ...data, ...patch }).success).toBe(false);
});

it("浏览器授权只接受宿主用户任务来源与有界域名清单", () => {
  const value = {
    source: "user_task",
    allowedDomains: ["example.com"],
    allowInteraction: false,
  };
  expect(authorization.parse(value)).toEqual(value);
  for (const patch of [
    { source: "model" },
    { allowedDomains: [] },
    { allowedDomains: Array(31).fill("example.com") },
    { allowInteraction: "true" },
    { ownerId: "model" },
  ])
    expect(authorization.safeParse({ ...value, ...patch }).success).toBe(false);
});

it("旧Worker输入兼容且新授权仍严格解析", async () => {
  const { agenticWorkerInputSchema } =
    await import("../src/internal/agentic-worker");
  const input = {
    kind: "agentic.run",
    operationKey: "research",
    taskType: "agentic.research",
    goal: "研究",
    systemPrompt: "方法",
    capability: "research",
    maxOutputTokens: 100,
    dryRun: false,
    tools: [
      {
        name: "web.read",
        version: "1",
        label: "读网页",
        description: "读取",
        parameters: {},
        effect: "none",
      },
    ],
  };
  expect(agenticWorkerInputSchema.safeParse(input).success).toBe(true);
  expect(
    agenticWorkerInputSchema.safeParse({
      ...input,
      browserAuthorization: {
        source: "user_task",
        allowedDomains: ["example.com"],
        allowInteraction: true,
      },
    }).success,
  ).toBe(true);
  expect(
    agenticWorkerInputSchema.safeParse({
      ...input,
      browserAuthorization: {
        source: "model",
        allowedDomains: ["example.com"],
        allowInteraction: true,
      },
    }).success,
  ).toBe(false);
  expect(
    agenticWorkerInputSchema.safeParse({ ...input, ownerId: "self" }).success,
  ).toBe(false);
});
