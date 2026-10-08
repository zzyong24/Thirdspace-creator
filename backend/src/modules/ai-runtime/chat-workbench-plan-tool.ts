import type { WorkbenchCapability } from "@creatoros/contract/agent-workbench";

const step = {
  type: "object", additionalProperties: false,
  properties: {
    stepId: {type: "string", minLength: 1, maxLength: 160},
    title: {type: "string", minLength: 1, maxLength: 500},
    dependsOn: {type: "array", items: {type: "string", minLength: 1, maxLength: 160}},
    status: {type: "string", enum: ["pending", "running", "waiting_user", "succeeded", "failed", "cancelled", "skipped"]},
    operationRefs: {type: "array", items: {type: "string", minLength: 1, maxLength: 160}},
    artifactRefs: {type: "array", items: {type: "string", minLength: 1, maxLength: 160}},
    supersedes: {type: "string", minLength: 1, maxLength: 160},
  },
  required: ["stepId", "title", "dependsOn", "status", "operationRefs", "artifactRefs"],
};

/** 通用计划是可选工具；完成判定仍由后端核验原调用回执。 */
export const chatWorkbenchPlanCapability: WorkbenchCapability = {
  name: "plan.update", schemaVersion: 1,
  description: "保存或修订当前任务的多步计划。先传 expectedRevision；成功步骤必须引用真实已完成工具回执或产物。",
  inputSchema: {type: "object", additionalProperties: false, properties: {expectedRevision: {type: "integer", minimum: 0}, steps: {type: "array", items: step}}, required: ["expectedRevision", "steps"]},
  resultSchema: {type: "object"}, effects: ["task_write"], requiredCapabilities: ["workbench.plan"], platforms: ["macos", "windows", "linux"],
};
