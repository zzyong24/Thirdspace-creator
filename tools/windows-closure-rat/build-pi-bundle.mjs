import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";

const [outputArg = "tools/windows-closure-rat/out/pi-bundle.mjs"] =
  process.argv.slice(2);
const repoRoot = process.cwd();
const safeOutputBase = resolve(repoRoot, "tools", "windows-closure-rat", "out");
const output = resolve(repoRoot, outputArg);
if (!output.startsWith(`${safeOutputBase}${sep}`)) {
  throw new Error(`[closure-rat] Pi bundle 输出必须位于 ${safeOutputBase} 内`);
}
const esbuildModule = resolve(
  repoRoot,
  "node_modules",
  ".pnpm",
  "node_modules",
  "esbuild",
  "lib",
  "main.js",
);
if (!existsSync(esbuildModule)) {
  throw new Error(`[closure-rat] esbuild module 缺失:${esbuildModule}`);
}
const { buildSync } = createRequire(import.meta.url)(esbuildModule);
mkdirSync(dirname(output), { recursive: true });
buildSync({
  entryPoints: [
    resolve(repoRoot, "tools", "windows-closure-rat", "pi-entry.mjs"),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node25",
  outfile: output,
  logLevel: "warning",
  banner: {
    js: "import { createRequire as __creatorosCreateRequire } from 'node:module'; const require = __creatorosCreateRequire(import.meta.url);",
  },
});
console.log(`[closure-rat] Pi bundle: ${output}`);
