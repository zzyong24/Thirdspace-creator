import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { generateKeyPairSync, sign } from "node:crypto";
import { _resetRegistry, getTemplate } from "@creatoros/ai-worker";
import { fetchRemotePromptOverrides } from "./remote-prompt-bundle";
import {
  applySkillConfigOverridesFromDb,
  type SkillConfigOverrideReadPort,
  type SkillConfigOverrideRow,
} from "./skill-config-overrides";

// [T-166 / P3] 真 HTTP 端到端集成测 —— 起本地 http server 供签名包,用**真 fetch**(非注入 fake)
// 跑通「拉取 → 验签 → 解析 → 套 REGISTRY(skill 粒度锁守 D1)」全链。把「真拉取 E2E」从「产品方真机」
// 收窄成本地可验证;剩产品方 op 只剩「选生产托管 URL」(纯基建,非代码/逻辑)。

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUB_PEM = publicKey.export({ type: "spki", format: "pem" }) as string;

function fakeReadPort(
  rows: readonly SkillConfigOverrideRow[],
): SkillConfigOverrideReadPort {
  return { loadAll: async () => rows };
}
function row(
  partial: Partial<SkillConfigOverrideRow> & { id: string },
): SkillConfigOverrideRow {
  return {
    version: null,
    system: null,
    template: null,
    tools: null,
    requiredFacets: null,
    outputSchema: null,
    updatedBy: null,
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...partial,
  };
}

let server: Server | undefined;
afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
  _resetRegistry();
});

/** 起一个本地 http server:GET /bundle.json 与 /bundle.json.sig。返回 base URL。 */
async function serveSignedBundle(bundleObj: unknown): Promise<string> {
  const bytes = Buffer.from(JSON.stringify(bundleObj));
  const sig = sign(null, bytes, privateKey).toString("base64");
  server = createServer((req, res) => {
    if (req.url === "/bundle.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(bytes);
    } else if (req.url === "/bundle.json.sig") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(sig);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  const port = (server!.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}/bundle.json`;
}

describe("[T-166] P3 真 HTTP 端到端(本地 server + 真 fetch)", () => {
  it("起 server → 真 fetch 签名包 → 验签 → 套 REGISTRY(远程-only skill 生效)", async () => {
    const url = await serveSignedBundle({
      version: "1",
      signedAt: "2026-07-07T00:00:00.000Z",
      overrides: [{ id: "chatbox.review", system: "远程 review via HTTP" }],
    });

    // 真 fetch(全局 fetch,非注入)→ 验签 → 解析。
    const remote = await fetchRemotePromptOverrides({ url, publicKey: PUB_PEM });
    expect(remote).toHaveLength(1);
    expect(remote[0]!.id).toBe("chatbox.review");

    // 套进 REGISTRY(本地空 → 远程生效)。
    const res = await applySkillConfigOverridesFromDb({
      readPort: fakeReadPort([]),
      remoteOverrides: remote,
    });
    expect(res.remoteApplied).toBe(1);
    expect(getTemplate("chatbox.review").system).toBe("远程 review via HTTP");
  });

  it("真 HTTP 全链 + D1 skill 锁:本地手改 chatbox.topic → 远程改它被整条丢弃", async () => {
    const builtinTopicTemplate = getTemplate("chatbox.topic").template;
    _resetRegistry();

    const url = await serveSignedBundle({
      version: "1",
      signedAt: "2026-07-07T00:00:00.000Z",
      overrides: [
        { id: "chatbox.topic", template: "远程 topic template(不该生效)" },
        { id: "chatbox.review", system: "远程 review 生效" },
      ],
    });
    const remote = await fetchRemotePromptOverrides({ url, publicKey: PUB_PEM });

    const res = await applySkillConfigOverridesFromDb({
      // 本地手改了 chatbox.topic 的 system。
      readPort: fakeReadPort([
        row({ id: "chatbox.topic", system: "本地手改 topic system" }),
      ]),
      remoteOverrides: remote,
    });

    // chatbox.topic:本地赢,远程 template 被 skill 锁挡(保持内置)。
    expect(getTemplate("chatbox.topic").system).toBe("本地手改 topic system");
    expect(getTemplate("chatbox.topic").template).toBe(builtinTopicTemplate);
    // chatbox.review:本地无 → 远程生效。
    expect(getTemplate("chatbox.review").system).toBe("远程 review 生效");
    expect(res.remoteApplied).toBe(1); // 只有 review 进(topic 被锁)
  });

  it("server 返坏签名 → 真 fetch 后验签失败 → [](纯本地降级)", async () => {
    const bytes = Buffer.from(
      JSON.stringify({ overrides: [{ id: "chatbox.review", system: "x" }] }),
    );
    server = createServer((req, res) => {
      if (req.url === "/bundle.json") {
        res.writeHead(200);
        res.end(bytes);
      } else {
        res.writeHead(200);
        res.end("YmFkLXNpZ25hdHVyZQ=="); // 坏签名
      }
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const port = (server!.address() as AddressInfo).port;
    const remote = await fetchRemotePromptOverrides({
      url: `http://127.0.0.1:${port}/bundle.json`,
      publicKey: PUB_PEM,
      logger: () => {},
    });
    expect(remote).toEqual([]);
  });
});
