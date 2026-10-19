import { describe, expect, it } from "vitest";
import { ENDPOINTS } from "../src/endpoints";
import { getCliOperationPolicy } from "../src/cli-policy";
import { WORKSPACE_OPERATION_SCOPES } from "../src/workspace-operation-scope";
import { collectionCapability, platformCapability } from "../src/resources/platform-capabilities";

describe("T1159 当前微信报表的公开合同与纯组兼容", () => {
  it("原生报告有独立采集能力，不伪装为全部作品目录", () => {
    expect(collectionCapability.safeParse("nativeReports").success).toBe(true);
    expect(platformCapability.safeParse("nativeReports").success).toBe(true);
    expect(collectionCapability.safeParse("workCatalog").success).toBe(true);
  });

  it("账号报表提供只读公开入口并要求真实平台账号作用域", () => {
    const operations = Object.values(ENDPOINTS);
    const endpoint = operations.find(operation => String(operation.id) === "platforms.reports.list");
    expect(endpoint).toMatchObject({ method: "GET", path: "/accounts/:accountId/platform-reports" });
    expect(getCliOperationPolicy("platforms.reports.list")).toMatchObject({ effect: "read", confirmation: "none" });
    expect((WORKSPACE_OPERATION_SCOPES as Record<string, string>)["platforms.reports.list"]).toBe("platform-account");
  });

  it("新增账号报表不回退现有空账号组的工具、模型和项目权限", () => {
    expect(WORKSPACE_OPERATION_SCOPES["workbench.capabilities.list"]).toBe("group");
    expect(WORKSPACE_OPERATION_SCOPES["workbench.modelCalls.summary"]).toBe("group");
    expect(WORKSPACE_OPERATION_SCOPES["projects.list"]).toBe("group");
    expect(getCliOperationPolicy("workbench.capabilities.list")).toMatchObject({ effect: "read" });
  });
});
