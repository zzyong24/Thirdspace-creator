import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const reportPath = resolve(
  process.env.CREATOROS_NEXT_OUTPUT_REPORT ??
    "tools/windows-closure-rat/out/next-adapter-outputs.json",
);

function toRepoRelative(repoRoot, value) {
  if (typeof value !== "string") return value;
  const rel = relative(repoRoot, value);
  return rel.startsWith("..") ? value : rel.replaceAll("\\", "/");
}

function normalizeOutput(repoRoot, output) {
  const normalized = {
    ...output,
    filePath: toRepoRelative(repoRoot, output.filePath),
  };
  if (output.assets) {
    normalized.assets = Object.fromEntries(
      Object.entries(output.assets)
        .map(([key, value]) => [key.replaceAll("\\", "/"), toRepoRelative(repoRoot, value)])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  return normalized;
}

export default {
  name: "creatoros-windows-closure-rat",
  async onBuildComplete(context) {
    const normalized = Object.fromEntries(
      Object.entries(context.outputs).map(([kind, outputs]) => [
        kind,
        Array.isArray(outputs)
          ? outputs.map((output) => normalizeOutput(context.repoRoot, output))
          : normalizeOutput(context.repoRoot, outputs),
      ]),
    );
    const report = {
      schemaVersion: 1,
      nextVersion: context.nextVersion,
      buildId: context.buildId,
      projectDir: toRepoRelative(context.repoRoot, context.projectDir),
      distDir: toRepoRelative(context.repoRoot, context.distDir),
      outputCounts: Object.fromEntries(
        Object.entries(context.outputs).map(([kind, outputs]) => [
          kind,
          Array.isArray(outputs) ? outputs.length : outputs ? 1 : 0,
        ]),
      ),
      outputs: normalized,
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[closure-rat] Next adapter output report: ${reportPath}`);
  },
};
