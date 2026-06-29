import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Architecture guard (SPEC §19 "组合层只能调用 service … 不允许跨模块 repository
// join" + SPEC §22 "没有跨模块 repository import"). This composition module owns no
// SQL: it must NOT import any repository, the db factory, Drizzle, or a Drizzle
// query helper, and it must reach peer modules ONLY via their `index.ts` (no deep
// `modules/<m>/<m>.service` / `<m>.repository` paths).

const HERE = dirname(fileURLToPath(import.meta.url));

function moduleSourceFiles(): string[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => !f.endsWith(".test.ts")) // guard the SHIPPED source, not tests
    .map((f) => join(HERE, f));
}

function importLines(src: string): string[] {
  // Crude but sufficient: every line that imports/re-exports from a module path.
  return src
    .split("\n")
    .filter((l) => /\bfrom\s+["']/.test(l) || /import\s+["']/.test(l));
}

describe("query-services architecture guard (SPEC §19/§22)", () => {
  const files = moduleSourceFiles();

  it("has shipped source files to guard", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports NO repository / db factory / drizzle / drizzle query helper", () => {
    const forbidden = [
      /\.repository(["'/]|$)/, // any *.repository import
      /\bcreateDb\b/, // the pglite/Drizzle db factory
      /from\s+["']drizzle-orm["']/, // drizzle directly
      /\bdrizzle\b/, // any drizzle import
    ];
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const line of importLines(src)) {
        if (forbidden.some((re) => re.test(line))) {
          hits.push(`${file}: ${line.trim()}`);
        }
      }
      // `eq(`/`and(` etc. from drizzle-orm must not appear anywhere (not just
      // imports) — the module issues no SQL.
      if (/\beq\(\s*\w+\.\w+/.test(src)) {
        hits.push(`${file}: uses a drizzle eq(table.col) expression`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("imports peer modules ONLY via their index.ts (no deep service/repository paths)", () => {
    const deepPath =
      /from\s+["']@\/server\/modules\/[^"']+\/[^"']+\.(service|repository|transport|db-schema)["']/;
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const line of importLines(src)) {
        if (deepPath.test(line)) hits.push(`${file}: ${line.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("issues NO SQL (no db.select / pgTable / createDb in the source)", () => {
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (/\bdb\.select\b/.test(src)) hits.push(`${file}: db.select`);
      if (/\bpgTable\b/.test(src)) hits.push(`${file}: pgTable`);
      if (/\bcreateDb\b/.test(src)) hits.push(`${file}: createDb`);
    }
    expect(hits).toEqual([]);
  });
});
