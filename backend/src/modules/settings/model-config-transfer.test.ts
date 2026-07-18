// [T-363] 模型配置导出/导入(设置页兜底)—— service 层 round-trip + 敏感值处理单测。
//
// 关键不变式:
//   - 导出**不解密**:文件里的 secretValue = 库中存储形态(masterKey 注入时恒为 enc:v1: 密文);
//   - 导入走既有 setModelConfiguration 写路径(capability 冲突覆盖),密钥解包后重加密落库;
//   - 跨机器密文(别的 key 加密)→ 配置照导 + secret 诚实标 unrecoverable,绝不写坏值;
//   - 文件行无密钥 → putModel 既有语义保留库中已存密钥(kept-existing);
//   - 结构不对 → ModelConfigImportError(→400),不半吞。
import { describe, it, expect, beforeEach } from "vitest";
import {
  createDb,
  encryptSecret,
  type Db,
  type RequestContext,
} from "@creatoros/backend";
import { createSettingsRepository } from "./settings.repository";
import {
  createSettingsService,
  ModelConfigImportError,
  type SettingsService,
} from "./settings.service";
import type { UserResource } from "./settings.schema";

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9); // 「另一台机器」的 master key

const ctx: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };

const fakeUser: UserResource = {
  id: "user-a",
  email: "a@example.com",
  displayName: "A",
  timezone: "UTC",
  locale: "zh-CN",
} as UserResource;

function buildService(db: Db): SettingsService {
  let n = 0;
  const repo = createSettingsRepository(db, {
    now: () => "2026-07-17T00:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-t-${++n}`,
    masterKey: KEY,
  });
  return createSettingsService(
    () => repo,
    async () => fakeUser,
    async () => fakeUser,
  );
}

describe("model config export/import (T-363)", () => {
  let db: Db;
  let service: SettingsService;

  beforeEach(async () => {
    ({ db } = await createDb());
    service = buildService(db);
  });

  it("round-trip:导出密文不解密 → 清空后导入 → 配置与密钥完整还原", async () => {
    await service.setModelConfiguration(ctx, "default", {
      provider: "minimax",
      modelName: "MiniMax-M2",
      secret: "sk-live-123",
      baseUrl: "https://api.minimax.io/anthropic",
      apiFormat: "anthropic",
      settings: { temperature: 0.7 },
      isDefault: true,
    });
    await service.setModelConfiguration(ctx, "image.generate", {
      provider: "minimax",
      modelName: "image-01",
      secret: "sk-image-456",
    });

    const file = await service.exportModelConfigs(ctx);
    expect(file.kind).toBe("creatoros.model-config-export");
    expect(file.models).toHaveLength(2);
    // 导出的密钥是密文(不含明文 key)。
    expect(file.secretForm).toBe("encrypted");
    for (const m of file.models) {
      expect(m.secretValue!.startsWith("enc:v1:")).toBe(true);
      expect(JSON.stringify(m)).not.toContain("sk-live-123");
      expect(JSON.stringify(m)).not.toContain("sk-image-456");
    }

    // 模拟重置后的空库(同 master key —— keychain/.master-key 重置不丢)。
    ({ db } = await createDb());
    service = buildService(db);
    const report = await service.importModelConfigs(ctx, file);
    expect(report.total).toBe(2);
    expect(report.imported).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.rows.every((r) => r.secret === "imported")).toBe(true);

    // 配置还原;密钥经解包→重加密,内部读能拿回明文。
    const restored = await service.getModelConfig(ctx, "default");
    expect(restored?.provider).toBe("minimax");
    expect(restored?.baseUrl).toBe("https://api.minimax.io/anthropic");
    expect(restored?.secretValue).toBe("sk-live-123");
    const image = await service.getModelConfig(ctx, "image.generate");
    expect(image?.secretValue).toBe("sk-image-456");
  });

  it("capability 冲突 → 覆盖(既有 upsert 语义)", async () => {
    await service.setModelConfiguration(ctx, "default", {
      provider: "anthropic",
      modelName: "old-model",
      secret: "sk-old",
    });
    const report = await service.importModelConfigs(ctx, {
      kind: "creatoros.model-config-export",
      version: 1,
      exportedAt: "2026-07-17T00:00:00.000Z",
      secretForm: "none",
      models: [
        { capability: "default", provider: "minimax", modelName: "MiniMax-M2" },
      ],
    });
    expect(report.imported).toBe(1);
    const row = await service.getModelConfig(ctx, "default");
    expect(row?.provider).toBe("minimax");
    // 文件行无密钥 → 保留库中已存密钥(kept-existing)。
    expect(report.rows[0]!.secret).toBe("kept-existing");
    expect(row?.secretValue).toBe("sk-old");
  });

  it("跨机器密文(别的 master key)→ 配置照导,密钥诚实标 unrecoverable", async () => {
    const foreign = encryptSecret("sk-foreign", OTHER_KEY);
    const report = await service.importModelConfigs(ctx, {
      kind: "creatoros.model-config-export",
      version: 1,
      exportedAt: "2026-07-17T00:00:00.000Z",
      secretForm: "encrypted",
      models: [
        {
          capability: "default",
          provider: "minimax",
          modelName: "MiniMax-M2",
          secretValue: foreign,
        },
      ],
    });
    expect(report.imported).toBe(1);
    expect(report.rows[0]!.secret).toBe("unrecoverable");
    expect(report.rows[0]!.message).toContain("重新填写");
    const row = await service.getModelConfig(ctx, "default");
    expect(row?.provider).toBe("minimax");
    expect(row?.secretValue ?? null).toBeNull(); // 绝不塞进解不开的坏值
  });

  it("明文密钥(手编文件)→ 透传导入并加密落库", async () => {
    const report = await service.importModelConfigs(ctx, {
      kind: "creatoros.model-config-export",
      version: 1,
      exportedAt: "2026-07-17T00:00:00.000Z",
      secretForm: "plaintext",
      models: [
        {
          capability: "default",
          provider: "minimax",
          modelName: "MiniMax-M2",
          secretValue: "sk-plain",
        },
      ],
    });
    expect(report.rows[0]!.secret).toBe("imported");
    const row = await service.getModelConfig(ctx, "default");
    expect(row?.secretValue).toBe("sk-plain");
  });

  it("结构不对 → ModelConfigImportError(kind/version/models/必填字段)", async () => {
    await expect(service.importModelConfigs(ctx, null)).rejects.toThrow(
      ModelConfigImportError,
    );
    await expect(
      service.importModelConfigs(ctx, { kind: "wrong", version: 1, models: [] }),
    ).rejects.toThrow(/kind/);
    await expect(
      service.importModelConfigs(ctx, {
        kind: "creatoros.model-config-export",
        version: 2,
        models: [],
      }),
    ).rejects.toThrow(/版本/);
    await expect(
      service.importModelConfigs(ctx, {
        kind: "creatoros.model-config-export",
        version: 1,
        models: [{ capability: "default" }],
      }),
    ).rejects.toThrow(/必填/);
  });

  it("未配任何模型 → 导出空 models + secretForm=none", async () => {
    const file = await service.exportModelConfigs(ctx);
    expect(file.models).toHaveLength(0);
    expect(file.secretForm).toBe("none");
  });
});
