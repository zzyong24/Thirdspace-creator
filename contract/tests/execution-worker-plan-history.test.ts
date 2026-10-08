import {expect, it} from "vitest";
import {workerPortInputSchemas} from "../src/internal/execution-worker";

it("历史计划内部读取只接收模型锚点，不接受任务身份或客户端计划", () => {
  const schema = workerPortInputSchemas.readWorkbenchPlan;
  expect(schema.parse({modelCallId: "settled-model"})).toEqual({modelCallId: "settled-model"});
  for (const value of [{}, {modelCallId: ""}, {modelCallId: 3}, {modelCallId: "m", taskId: "foreign"},
    {modelCallId: "m", conversationId: "foreign"}, {modelCallId: "m", planRevision: 3}, {modelCallId: "m", steps: []}])
    expect(schema.safeParse(value).success).toBe(false);
});
