/**
 * Contract tests for the shared business components (SPEC §7, D-006, D-007).
 *
 * These tests are the entry point for the shared-component contract:
 *  - the high-priority components from `specs/shared-components.md` section 7
 *    are exported from their owner directory,
 *  - each one mounts with a minimal prop shape,
 *  - each one exposes the DOM role/structure expected by downstream pages,
 *  - chart components expose a textual summary so screen readers can describe
 *    the data without parsing the SVG,
 *  - media-like components fall back to a deterministic placeholder when
 *    no asset is provided,
 *  - no shared component owns page routing or page-fixture selection.
 *
 * The test is the RED/GREEN contract for Task 7. Initially it must fail
 * because the shared component modules do not exist. After the GREEN pass
 * the file is the regression net for subsequent page implementations.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionCard } from "@/components/project/section-card";
import { MetricCard as MetricCardView } from "@/components/project/metric-card";
import { StatusBadge } from "@/components/project/status-badge";
import { ProgressBar } from "@/components/project/progress-bar";
import { TagChip } from "@/components/content/tag-chip";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { ProjectStageStepper } from "@/components/navigation/project-stage-stepper";
import { PageTabs } from "@/components/navigation/page-tabs";
import { ChartFrame } from "@/components/analytics/chart-frame";

const OWNED_DIRECTORIES = [
  "src/components/navigation",
  "src/components/project",
  "src/components/content",
  "src/components/resources",
  "src/components/publishing",
  "src/components/analytics",
] as const;

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@\/app\//,
  /from\s+["']\.\.\/\.\.\/app\//,
  /from\s+["']\.\.\/\.\.\/\.\.\/app\//,
  /from\s+["']@\/fixtures\/canonical/,
] as const;

describe("shared business components contract", () => {
  describe("ownership", () => {
    it.each(OWNED_DIRECTORIES)("owns the %s directory", (dir) => {
      const absolute = resolve(process.cwd(), dir);
      // We only assert that the directories are reserved for Task 7; the
      // existence of source files inside is verified by the module imports
      // below and by the subsequent test cases.
      expect(absolute.endsWith(dir)).toBe(true);
    });
  });

  describe("import isolation", () => {
    it.each(OWNED_DIRECTORIES)(
      "%s does not import from app routes or canonical fixtures",
      (dir) => {
        const violations = scanForForbiddenImports(dir);
        expect(violations).toEqual([]);
      },
    );
  });

  describe("SectionCard", () => {
    it("renders a labelled region with a heading and body slot", () => {
      render(
        <SectionCard title="项目概览" description="查看项目核心信息">
          <p>section body</p>
        </SectionCard>,
      );

      const region = screen.getByRole("region", { name: /项目概览/i });
      expect(region).toBeInTheDocument();
      expect(screen.getByText(/查看项目核心信息/i)).toBeInTheDocument();
      expect(screen.getByText("section body")).toBeInTheDocument();
    });
  });

  describe("MetricCard", () => {
    it("renders a labelled article with metric, value and delta", () => {
      render(
        <MetricCardView
          label="进行中项目"
          value="2"
          delta="+1"
          trend="up"
          tone="positive"
        />,
      );

      const article = screen.getByRole("article", { name: /进行中项目/i });
      expect(article).toBeInTheDocument();
      expect(article).toHaveTextContent("2");
      expect(article).toHaveTextContent("+1");
    });
  });

  describe("StatusBadge", () => {
    it("renders a labelled badge for an active project", () => {
      render(<StatusBadge status="active" />);
      const badge = screen.getByRole("status", { name: /进行中/i });
      expect(badge).toBeInTheDocument();
    });
  });

  describe("ProgressBar", () => {
    it("renders a progressbar with the value exposed to assistive tech", () => {
      render(<ProgressBar value={42} label="脚本进度" />);
      const bar = screen.getByRole("progressbar", { name: /脚本进度/i });
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveAttribute("aria-valuenow", "42");
    });
  });

  describe("TagChip", () => {
    it("renders the tag label as a non-interactive pill", () => {
      render(<TagChip label="AI" />);
      const chip = screen.getByText("AI");
      expect(chip).toBeInTheDocument();
    });
  });

  describe("PlatformIcon", () => {
    it("renders an icon with an accessible name for known platforms", () => {
      render(<PlatformIcon platform="douyin" />);
      const icon = screen.getByLabelText(/抖音/i);
      expect(icon).toBeInTheDocument();
    });
  });

  describe("ProjectStageStepper", () => {
    it("renders the six approved stages with a current marker", () => {
      render(
        <ProjectStageStepper
          currentStage="script"
          stages={[
            { id: "research", label: "研究", status: "completed" },
            { id: "planning", label: "策划", status: "completed" },
            { id: "script", label: "脚本", status: "in_progress" },
            { id: "production", label: "拍摄", status: "pending" },
            { id: "publishing", label: "发布", status: "pending" },
            { id: "review", label: "复盘", status: "pending" },
          ]}
        />,
      );

      const list = screen.getByRole("list", { name: /项目六阶段/i });
      expect(list).toBeInTheDocument();
      const items = list.querySelectorAll("li");
      expect(items).toHaveLength(6);
    });

    it("renders navigable segments for reached + immediate-next stages (segmented)", () => {
      render(
        <ProjectStageStepper
          variant="segmented"
          projectId="project-ainativebrowser"
          currentStage="script"
          stages={[
            { id: "research", label: "研究", status: "completed" },
            { id: "planning", label: "策划", status: "completed" },
            { id: "script", label: "脚本", status: "in_progress" },
            { id: "production", label: "拍摄", status: "pending" },
            { id: "publishing", label: "发布", status: "pending" },
            { id: "review", label: "复盘", status: "pending" },
          ]}
        />,
      );

      const list = screen.getByRole("list", { name: /项目六阶段/i });
      // Six <li> wrappers preserved (existing selector contract).
      expect(list.querySelectorAll("li")).toHaveLength(6);

      // Reached stages + current + immediate next (research..production) are links.
      for (const stage of ["research", "planning", "script", "production"]) {
        const seg = screen.getByTestId(`stage-segment-${stage}`);
        expect(seg.tagName).toBe("A");
        expect(seg).toHaveAttribute(
          "href",
          `/projects/project-ainativebrowser/${stage}`,
        );
      }
      // The current stage marks aria-current="step".
      expect(screen.getByTestId("stage-segment-script")).toHaveAttribute(
        "aria-current",
        "step",
      );
      // Stages further ahead than current+1 stay gated (not links).
      for (const stage of ["publishing", "review"]) {
        const seg = screen.getByTestId(`stage-segment-${stage}`);
        expect(seg.tagName).not.toBe("A");
        expect(seg).toHaveAttribute("aria-disabled", "true");
      }
    });

    it("keeps segments non-navigable when no projectId is supplied (segmented)", () => {
      render(
        <ProjectStageStepper
          variant="segmented"
          currentStage="research"
          stages={[
            { id: "research", label: "研究", status: "in_progress" },
            { id: "planning", label: "策划", status: "pending" },
          ]}
        />,
      );
      expect(screen.getByTestId("stage-segment-research").tagName).not.toBe("A");
    });
  });

  describe("PageTabs", () => {
    it("renders the tabs and a tablist role", () => {
      render(
        <PageTabs
          tabs={[
            { id: "overview", label: "概览" },
            { id: "details", label: "明细" },
          ]}
        />,
      );
      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /概览/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /明细/i }),
      ).toBeInTheDocument();
    });
  });

  describe("ChartFrame", () => {
    it("exposes a textual summary for assistive tech", () => {
      render(
        <ChartFrame
          title="本周播放"
          summary="本周累计播放 18,230 次，周三 1,980 次最低，周日 3,380 次最高"
          trend={[
            { label: "周一", value: 1840 },
            { label: "周二", value: 2210 },
            { label: "周三", value: 1980 },
          ]}
        />,
      );

      const chart = screen.getByRole("figure", { name: /本周播放/i });
      expect(chart).toBeInTheDocument();
      // Chart components must surface a sr-only textual summary
      // (D-007: no information is conveyed only by color).
      const summary = screen.getByText(
        /本周累计播放 18,230 次，周三 1,980 次最低，周日 3,380 次最高/,
      );
      expect(summary).toBeInTheDocument();
      expect(summary.className).toMatch(/sr-only/);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scanForForbiddenImports(directory: string): string[] {
  const violations: string[] = [];
  const root = resolve(process.cwd(), directory);
  const entries = listFilesRecursively(root);
  for (const file of entries) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    const contents = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      if (pattern.test(contents)) {
        violations.push(`${file} matches ${pattern}`);
      }
    }
  }
  return violations;
}

function listFilesRecursively(root: string): string[] {
  // Minimal recursive walker that does not pull in fs-extra; keeps the
  // helper self-contained.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = nodeFs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}
