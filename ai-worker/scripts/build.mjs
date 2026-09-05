import { build } from "esbuild";
import { fileURLToPath } from "node:url";
await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/execution-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
});

await build({
  entryPoints: [fileURLToPath(new URL("../src/execution/agentic-worker-entry.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/agentic-worker.cjs", import.meta.url)),
  bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "warning",
});
