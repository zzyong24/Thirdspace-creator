import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { buildChildEnv } from "./child-env";

// [RT-H06] env 收窄单测:allowlist 生效(密钥/DB/S3/master key/NODE_OPTIONS 结构性
// 排除)+ 真子进程断言(child 的 process.env 里确实没有 secrets —— 不止测纯函数)。

// 模拟一份「满是 secrets」的宿主 env(代表性覆盖:模型 key / DB / S3 / master key /
// NODE_OPTIONS 注入向量;真实变量名不必穷举 —— allowlist 结构性排除一切未点名键)。
const SECRET_ENV: NodeJS.ProcessEnv = {
  PATH: "/usr/bin:/bin",
  HOME: "/Users/tester",
  TMPDIR: "/tmp",
  LANG: "zh_CN.UTF-8",
  ANTHROPIC_API_KEY: "sk-ant-secret",
  MINIMAX_API_KEY: "mm-secret",
  OPENAI_API_KEY: "sk-openai-secret",
  DATABASE_URL: "postgres://user:pass@host/db",
  PGPASSWORD: "pg-secret",
  S3_SECRET_ACCESS_KEY: "s3-secret",
  AWS_SECRET_ACCESS_KEY: "aws-secret",
  CREATOROS_MASTER_KEY: "master-secret",
  NODE_OPTIONS: "--require /tmp/evil-preload.js",
};

describe("buildChildEnv (RT-H06 env allowlist)", () => {
  it("only passes allowlisted runtime vars; secrets/DB/S3/NODE_OPTIONS are excluded", () => {
    const env = buildChildEnv({}, SECRET_ENV);
    // 运行必需变量透传。
    expect(env.PATH).toBe("/usr/bin:/bin");
    expect(env.HOME).toBe("/Users/tester");
    expect(env.TMPDIR).toBe("/tmp");
    expect(env.LANG).toBe("zh_CN.UTF-8");
    // 密钥/DB/S3/master key/注入向量一律不透传(allowlist 结构性排除)。
    for (const key of [
      "ANTHROPIC_API_KEY",
      "MINIMAX_API_KEY",
      "OPENAI_API_KEY",
      "DATABASE_URL",
      "PGPASSWORD",
      "S3_SECRET_ACCESS_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "CREATOROS_MASTER_KEY",
      "NODE_OPTIONS",
    ]) {
      expect(env, `${key} 不该进子进程 env`).not.toHaveProperty(key);
    }
  });

  it("merges caller-supplied task vars (extra) on top of the allowlist", () => {
    const env = buildChildEnv(
      { HYPERFRAMES_BROWSER_PATH: "/opt/chromium", HYPERFRAMES_TELEMETRY: "0" },
      SECRET_ENV,
    );
    expect(env.HYPERFRAMES_BROWSER_PATH).toBe("/opt/chromium");
    expect(env.HYPERFRAMES_TELEMETRY).toBe("0");
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("skips allowlisted keys missing from the source env (no undefined entries)", () => {
    const env = buildChildEnv({}, { PATH: "/bin" });
    expect(Object.keys(env)).toEqual(["PATH"]);
  });

  it("a REAL child process spawned with the narrowed env cannot see secrets", async () => {
    // 真子进程断言(不止纯函数):以「宿主 env + 假密钥」为源构造收窄 env,起一个真
    // node 子进程 dump 它的 process.env —— 假密钥必须不可见,PATH 必须在。
    const source: NodeJS.ProcessEnv = {
      ...process.env,
      FAKE_MODEL_KEY_FOR_TEST: "leak-me-if-you-can",
      DATABASE_URL: "postgres://leak",
    };
    const childEnv = buildChildEnv({ TASK_LEVEL_VAR: "ok" }, source);
    const dumped = await new Promise<string>((resolve, reject) => {
      execFile(
        process.execPath,
        ["-e", "process.stdout.write(JSON.stringify(process.env))"],
        { env: childEnv, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(stdout)),
      );
    });
    const seen = JSON.parse(dumped) as Record<string, string>;
    expect(seen.FAKE_MODEL_KEY_FOR_TEST).toBeUndefined();
    expect(seen.DATABASE_URL).toBeUndefined();
    expect(seen.NODE_OPTIONS).toBeUndefined();
    expect(seen.TASK_LEVEL_VAR).toBe("ok");
    expect(typeof seen.PATH).toBe("string"); // 运行必需变量真到了子进程
  });
});
