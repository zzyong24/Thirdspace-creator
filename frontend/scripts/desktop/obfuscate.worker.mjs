// [T-452] obfuscate worker —— 单文件 worker，接收 { abs, rel, preset } 消息，返回混淆后写盘。
// 主 obfuscate.mjs 用 worker_threads pool 并行分发,把串行 for 循环打散到 CPU 核数。
//
// **纯 CPU 任务**(javascript-obfuscator AST 变换),多 worker 天然线性加速;IO 部分(read/write
// 各自文件)也无竞争。工程量小,收益 3-5×。

import { parentPort } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
import { obfuscateCode } from "./obfuscate.mjs";

const IDEMPOTENT_MARK = "/* creatoros-obfuscated */";

parentPort.on("message", ({ abs, rel, preset }) => {
  try {
    const code = readFileSync(abs, "utf8");
    if (code.startsWith(IDEMPOTENT_MARK)) {
      parentPort.postMessage({ rel, status: "skipped-idempotent" });
      return;
    }
    const out = obfuscateCode(code, preset);
    writeFileSync(abs, `${IDEMPOTENT_MARK}\n${out}`, "utf8");
    parentPort.postMessage({ rel, status: "ok", preset });
  } catch (e) {
    parentPort.postMessage({
      rel,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
