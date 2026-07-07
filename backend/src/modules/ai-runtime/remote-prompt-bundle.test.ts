import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  parseBundle,
  verifyBundleSignature,
  fetchRemotePromptOverrides,
} from "./remote-prompt-bundle";

// [T-166 / P3] 远程 prompt 包:Ed25519 验签(node:crypto 原生,gate③)+ 解析 + 诚实降级。

// 测试用 Ed25519 keypair(node:crypto 原生;真部署公钥来自 P3 打包脚本)。
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUB_PEM = publicKey.export({ type: "spki", format: "pem" }) as string;

function signBytes(bytes: Buffer): string {
  return sign(null, bytes, privateKey).toString("base64");
}

// 造一个 Response-like(注入 fetchImpl 用,不走网络)。
function fakeRes(opts: {
  ok?: boolean;
  status?: number;
  bytes?: Buffer;
  text?: string;
}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    arrayBuffer: async () =>
      (opts.bytes ?? Buffer.from("")).buffer.slice(
        (opts.bytes ?? Buffer.from("")).byteOffset,
        (opts.bytes ?? Buffer.from("")).byteOffset +
          (opts.bytes ?? Buffer.from("")).byteLength,
      ),
    text: async () => opts.text ?? "",
  } as unknown as Response;
}

describe("[T-166] verifyBundleSignature — Ed25519(node:crypto)", () => {
  it("正确签名 → true", () => {
    const bytes = Buffer.from(JSON.stringify({ overrides: [] }));
    expect(verifyBundleSignature(bytes, signBytes(bytes), PUB_PEM)).toBe(true);
  });

  it("篡改字节 → false(不套改过的包)", () => {
    const bytes = Buffer.from(JSON.stringify({ overrides: [] }));
    const sig = signBytes(bytes);
    const tampered = Buffer.from(JSON.stringify({ overrides: [{ id: "x" }] }));
    expect(verifyBundleSignature(tampered, sig, PUB_PEM)).toBe(false);
  });

  it("坏签名 / 空签名 / 坏公钥 → false(诚实拒绝,不抛)", () => {
    const bytes = Buffer.from("data");
    expect(verifyBundleSignature(bytes, "", PUB_PEM)).toBe(false);
    expect(verifyBundleSignature(bytes, "bm90LWEtc2ln", PUB_PEM)).toBe(false);
    expect(verifyBundleSignature(bytes, signBytes(bytes), "not a pem")).toBe(
      false,
    );
  });

  it("换一把公钥 → false(签名不匹配)", () => {
    const other = generateKeyPairSync("ed25519").publicKey.export({
      type: "spki",
      format: "pem",
    }) as string;
    const bytes = Buffer.from("data");
    expect(verifyBundleSignature(bytes, signBytes(bytes), other)).toBe(false);
  });
});

describe("[T-166] parseBundle — 收窄形状", () => {
  it("合形 → 保留;每条 override 收窄(id 缺失/非串丢弃)", () => {
    const b = parseBundle({
      version: "1.2",
      signedAt: "2026-07-07T00:00:00.000Z",
      overrides: [
        { id: "chatbox.topic", system: "s", tools: ["a", 1, "b"] },
        { system: "无 id 丢弃" },
        { id: "", system: "空 id 丢弃" },
        "非对象丢弃",
      ],
    });
    expect(b).not.toBeNull();
    expect(b!.version).toBe("1.2");
    expect(b!.overrides).toHaveLength(1);
    expect(b!.overrides[0]!.id).toBe("chatbox.topic");
    expect(b!.overrides[0]!.tools).toEqual(["a", "b"]); // 非串项过滤
  });

  it("形状不对 → null", () => {
    expect(parseBundle(null)).toBeNull();
    expect(parseBundle({ noOverrides: true })).toBeNull();
    expect(parseBundle({ overrides: "not array" })).toBeNull();
  });
});

describe("[T-166] fetchRemotePromptOverrides — 拉取 + 验签 + 诚实降级", () => {
  it("未配 URL 或公钥 → [](远程层关,零副作用)", async () => {
    expect(await fetchRemotePromptOverrides({})).toEqual([]);
    expect(
      await fetchRemotePromptOverrides({ url: "https://x/b.json" }),
    ).toEqual([]);
    expect(await fetchRemotePromptOverrides({ publicKey: PUB_PEM })).toEqual([]);
  });

  it("正常:签名有效 → 返回 overrides", async () => {
    const bundleObj = {
      version: "1",
      signedAt: "2026-07-07T00:00:00.000Z",
      overrides: [{ id: "chatbox.review", system: "远程 review" }],
    };
    const bytes = Buffer.from(JSON.stringify(bundleObj));
    const sig = signBytes(bytes);
    const fetchImpl = (async (u: string) =>
      u.endsWith(".sig")
        ? fakeRes({ text: sig })
        : fakeRes({ bytes })) as unknown as typeof fetch;

    const overrides = await fetchRemotePromptOverrides({
      url: "https://x/bundle.json",
      publicKey: PUB_PEM,
      fetchImpl,
      logger: () => {},
    });
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.id).toBe("chatbox.review");
    expect(overrides[0]!.system).toBe("远程 review");
  });

  it("验签失败 → [](不套未签/验不过内容)", async () => {
    const bytes = Buffer.from(JSON.stringify({ overrides: [{ id: "x" }] }));
    const fetchImpl = (async (u: string) =>
      u.endsWith(".sig")
        ? fakeRes({ text: "YmFkLXNpZw==" }) // 坏签名
        : fakeRes({ bytes })) as unknown as typeof fetch;
    expect(
      await fetchRemotePromptOverrides({
        url: "https://x/b.json",
        publicKey: PUB_PEM,
        fetchImpl,
        logger: () => {},
      }),
    ).toEqual([]);
  });

  it("网络失败(非 200 / throw)→ [](纯本地降级不崩)", async () => {
    const notOk = (async () =>
      fakeRes({ ok: false, status: 404 })) as unknown as typeof fetch;
    expect(
      await fetchRemotePromptOverrides({
        url: "https://x/b.json",
        publicKey: PUB_PEM,
        fetchImpl: notOk,
        logger: () => {},
      }),
    ).toEqual([]);

    const throws = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(
      await fetchRemotePromptOverrides({
        url: "https://x/b.json",
        publicKey: PUB_PEM,
        fetchImpl: throws,
        logger: () => {},
      }),
    ).toEqual([]);
  });
});
