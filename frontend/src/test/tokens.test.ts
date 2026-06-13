import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const tokensPath = resolve(process.cwd(), "src/styles/tokens.css");
const globalsPath = resolve(process.cwd(), "src/app/globals.css");
const layoutPath = resolve(process.cwd(), "src/app/layout.tsx");
const packagePath = resolve(process.cwd(), "package.json");
const tokensCss = existsSync(tokensPath) ? readFileSync(tokensPath, "utf8") : "";
const globalsCss = readFileSync(globalsPath, "utf8");
const layoutSource = readFileSync(layoutPath, "utf8");
const packageSource = readFileSync(packagePath, "utf8");

const requiredColorTokens = [
  "--creatoros-canvas",
  "--creatoros-surface",
  "--creatoros-surface-subtle",
  "--creatoros-brand",
  "--creatoros-brand-hover",
  "--creatoros-brand-soft",
  "--creatoros-text",
  "--creatoros-text-muted",
  "--creatoros-text-subtle",
  "--creatoros-border",
  "--creatoros-border-strong",
  "--creatoros-success",
  "--creatoros-success-soft",
  "--creatoros-warning",
  "--creatoros-warning-soft",
  "--creatoros-danger",
  "--creatoros-danger-soft",
  "--creatoros-info",
  "--creatoros-info-soft",
] as const;

const exactTokens = {
  "--creatoros-sidebar-width": "224px",
  "--creatoros-header-height": "80px",
  "--creatoros-page-gutter": "32px",
  "--creatoros-section-gap": "20px",
  "--creatoros-card-gap": "16px",
  "--creatoros-radius-control": "8px",
  "--creatoros-radius-card": "12px",
  "--creatoros-radius-panel": "16px",
  "--creatoros-text-xs": "12px",
  "--creatoros-text-sm": "14px",
  "--creatoros-text-md": "16px",
  "--creatoros-text-lg": "18px",
  "--creatoros-text-xl": "24px",
  "--creatoros-text-2xl": "32px",
  "--creatoros-z-header": "20",
  "--creatoros-z-sidebar": "30",
  "--creatoros-z-overlay": "50",
  "--creatoros-z-dialog": "60",
} as const;

const requiredFoundationTokens = [
  "--creatoros-font-sans",
  "--creatoros-shadow-card",
  "--creatoros-shadow-popover",
  "--creatoros-chart-1",
  "--creatoros-chart-2",
  "--creatoros-chart-3",
  "--creatoros-chart-4",
  "--creatoros-chart-5",
] as const;

const semanticMappings = {
  "--background": "--creatoros-canvas",
  "--foreground": "--creatoros-text",
  "--primary": "--creatoros-brand",
  "--muted": "--creatoros-surface-subtle",
  "--border": "--creatoros-border",
  "--ring": "--creatoros-brand",
  "--chart-1": "--creatoros-chart-1",
  "--chart-5": "--creatoros-chart-5",
  "--sidebar": "--creatoros-surface",
  "--sidebar-foreground": "--creatoros-text",
  "--sidebar-primary": "--creatoros-brand",
  "--sidebar-border": "--creatoros-border",
  "--radius": "--creatoros-radius-card",
} as const;

function expectDeclaration(
  css: string,
  property: string,
  valuePattern = "[^;]+",
) {
  expect(css).toMatch(
    new RegExp(`${property.replaceAll("-", "\\-")}\\s*:\\s*${valuePattern}\\s*;`),
  );
}

describe("CreatorOS design tokens", () => {
  test("provides the shared token stylesheet", () => {
    expect(existsSync(tokensPath), "src/styles/tokens.css must exist").toBe(true);
  });

  test("defines every approved color and foundation token", () => {
    for (const token of [...requiredColorTokens, ...requiredFoundationTokens]) {
      expectDeclaration(tokensCss, token);
    }
  });

  test("uses the approved geometry, type scale, and z-index values", () => {
    for (const [token, value] of Object.entries(exactTokens)) {
      expectDeclaration(tokensCss, token, value);
    }
  });

  test("imports tokens before mapping shadcn semantic variables", () => {
    expect(globalsCss).toMatch(/@import\s+["']\.\.\/styles\/tokens\.css["'];/);

    for (const [semanticToken, creatorToken] of Object.entries(
      semanticMappings,
    )) {
      expectDeclaration(
        globalsCss,
        semanticToken,
        `var\\(${creatorToken.replaceAll("-", "\\-")}\\)`,
      );
    }
  });

  test("exposes Tailwind font aliases without recursive variables", () => {
    expect(globalsCss).toMatch(
      /--font-sans\s*:\s*var\(--creatoros-font-sans\)\s*;/,
    );
    expect(globalsCss).not.toMatch(
      /--font-sans\s*:\s*var\(--font-sans\)\s*;/,
    );
  });

  test("bundles the approved local font without Google font imports", () => {
    expect(packageSource).toMatch(
      /"@fontsource-variable\/noto-sans-sc"\s*:\s*"5\.2\.10"/,
    );
    expect(`${layoutSource}\n${globalsCss}`).toMatch(
      /@fontsource-variable\/noto-sans-sc/,
    );
    expect(layoutSource).not.toMatch(/next\/font\/google/);
  });
});
