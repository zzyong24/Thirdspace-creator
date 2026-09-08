import { chmod, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CONNECTION_SCHEMA,
  CREDENTIAL_SCHEMA,
  ConnectionError,
  discoverConnection,
  revokeConnection,
} from "../src/connection";

async function fixture(overrides: Record<string, unknown> = {}) {
  const dir = join(tmpdir(), `creatoros-cli-${randomUUID()}`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const credentialFile = join(dir, "credential.json");
  const connectionFile = join(dir, "connection.json");
  await writeFile(
    credentialFile,
    JSON.stringify({
      schema: CREDENTIAL_SCHEMA,
      productId: "creatoros",
      packageId: "com.creatoros.app",
      handshakeToken: "hs-token",
      cliAccessToken: "cli-token",
      launchNonce: "launch-1",
    }),
    { mode: 0o600 },
  );
  await writeFile(
    connectionFile,
    JSON.stringify({
      schema: CONNECTION_SCHEMA,
      productId: "creatoros",
      packageId: "com.creatoros.app",
      protocolVersion: 1,
      pid: 4321,
      port: 43127,
      issuedAt: Date.parse("2026-08-15T00:00:00.000Z"),
      expiresAt: Date.parse("2026-08-15T03:00:00.000Z"),
      access: "full",
      credentialFile: "credential.json",
      launchNonceSha256: createHash("sha256").update("launch-1").digest("hex"),
      ...overrides,
    }),
    { mode: 0o600 },
  );
  return { connectionFile };
}

describe("discoverConnection", () => {
  it("读取当前用户连接，秘密与 descriptor 分离", async () => {
    const { connectionFile } = await fixture();
    const connection = await discoverConnection({
      connectionFile,
      productId: "creatoros",
      now: new Date("2026-08-15T01:00:00.000Z"),
      processAlive: () => true,
    });
    expect(connection.baseUrl).toBe("http://127.0.0.1:43127");
    expect(connection.handshakeToken).toBe("hs-token");
    expect(connection.cliAccessToken).toBe("cli-token");
  });

  it("过期、死进程和错产品均 fail closed", async () => {
    const { connectionFile } = await fixture();
    await expect(discoverConnection({
      connectionFile,
      now: new Date("2026-08-15T04:00:00.000Z"),
      processAlive: () => true,
    })).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
    await expect(discoverConnection({
      connectionFile,
      now: new Date("2026-08-15T01:00:00.000Z"),
      processAlive: () => false,
    })).rejects.toMatchObject({ code: "CONNECTION_STALE" });
    await expect(discoverConnection({
      connectionFile,
      productId: "other-product",
      now: new Date("2026-08-15T01:00:00.000Z"),
      processAlive: () => true,
    })).rejects.toMatchObject({ code: "CONNECTION_INVALID" });
  });

  it("descriptor 与凭据的包身份或启动 nonce 不一致时拒绝", async () => {
    const wrongPackage = await fixture({ packageId: "com.other.app" });
    await expect(discoverConnection({
      connectionFile: wrongPackage.connectionFile,
      now: new Date("2026-08-15T01:00:00.000Z"),
      processAlive: () => true,
    })).rejects.toMatchObject({ code: "CONNECTION_INVALID" });

    const wrongNonce = await fixture({ launchNonceSha256: "0".repeat(64) });
    await expect(discoverConnection({
      connectionFile: wrongNonce.connectionFile,
      now: new Date("2026-08-15T01:00:00.000Z"),
      processAlive: () => true,
    })).rejects.toMatchObject({ code: "CONNECTION_INVALID" });
  });

  it.runIf(process.platform !== "win32")("POSIX 权限过宽时拒绝", async () => {
    const { connectionFile } = await fixture();
    await chmod(connectionFile, 0o644);
    const error = await discoverConnection({
      connectionFile,
      now: new Date("2026-08-15T01:00:00.000Z"),
      processAlive: () => true,
    }).catch((value) => value as ConnectionError);
    expect(error).toMatchObject({ code: "CONNECTION_INSECURE" });
  });
});

it("撤销 CLI 连接同时记住关闭选择，不保留凭据", async()=>{
 const {connectionFile}=await fixture();
 const connection=await discoverConnection({connectionFile,productId:"creatoros",now:new Date("2026-08-15T01:00:00.000Z"),processAlive:()=>true});
 await revokeConnection(connection);
 const preference=JSON.parse(await readFile(join(connectionFile,"..","preference.json"),"utf8"));
 expect(preference).toEqual({schema:"creatoros-cli-preference/v1",productId:"creatoros",packageId:"com.creatoros.app",enabled:false});
 await expect(stat(connection.descriptorPath)).rejects.toMatchObject({code:"ENOENT"});
 await expect(stat(connection.credentialPath)).rejects.toMatchObject({code:"ENOENT"});
});
