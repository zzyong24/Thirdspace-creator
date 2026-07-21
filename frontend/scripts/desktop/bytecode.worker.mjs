// [T-452] bytecode worker —— 单文件 worker,接收 { abs, jscAbs, jscBase, stubMark } 消息,
//   跑 bytenode.compileFile → 写 .jsc + 用 stub 替换 .js。
//
// bytenode 内部走 V8 vm.Script + produceCachedData;每个 worker_thread 有独立 V8 isolate,
//   互不冲突。3-5× 并行加速。

import { parentPort } from "node:worker_threads";
import { writeFileSync, existsSync, rmSync } from "node:fs";
import bytenode from "bytenode";

parentPort.on("message", ({ abs, jscAbs, jscBase, stubMark }) => {
  try {
    bytenode.compileFile({ filename: abs, output: jscAbs });
    const stub = `${stubMark}\nrequire('bytenode');\nmodule.exports=require('./${jscBase}');\n`;
    writeFileSync(abs, stub, "utf8");
    parentPort.postMessage({ abs, status: "ok" });
  } catch (e) {
    if (existsSync(jscAbs)) {
      try {
        rmSync(jscAbs);
      } catch {
        /* noop */
      }
    }
    parentPort.postMessage({
      abs,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
