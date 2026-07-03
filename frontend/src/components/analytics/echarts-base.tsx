"use client";

/**
 * `EChart` — the shared client-only ECharts renderer for the Analytics & Review
 * page (T-035b). Wraps `echarts-for-react/core` with an EXPLICIT, tree-shaken
 * echarts core: only the chart types + components the review page actually uses
 * are registered (LineChart / FunnelChart / BarChart + Tooltip / Grid / the
 * Canvas renderer). Registering the minimal set keeps the client bundle small
 * versus importing the `echarts` barrel.
 *
 * SSR safety (task §4): ECharts touches `window` / `<canvas>`, which do not
 * exist during the server render. We therefore:
 *   - mark this module `"use client"`, and
 *   - load `echarts-for-react/core` via `next/dynamic({ ssr: false })` so the
 *     component only ever mounts in the browser (never during the Server
 *     Component / SSR pass).
 *
 * Theme: colors come from the project CSS design tokens (`--color-chart-*`,
 * `--color-brand`, …) resolved off the live DOM at mount, so the charts follow
 * light / dark theme (the `.dark` class swaps the token values). We read the
 * tokens through `getComputedStyle` rather than hard-coding hexes so a token
 * change (or the dark palette) is reflected without touching this file.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

// `echarts-for-react/core` lets us hand it a pre-assembled echarts core with
// ONLY the modules we register below — nothing else is pulled into the bundle.
// Loaded via next/dynamic with ssr:false so it never runs during SSR.
const ReactEChartsCore = dynamic(
  async () => {
    const [{ default: ReactEChartsCoreImpl }, echarts, charts, components, renderers] =
      await Promise.all([
        import("echarts-for-react/lib/core"),
        import("echarts/core"),
        import("echarts/charts"),
        import("echarts/components"),
        import("echarts/renderers"),
      ]);
    echarts.use([
      charts.LineChart,
      charts.FunnelChart,
      charts.BarChart,
      // [T-091] 知识图谱 force 布局 + 图例过滤(series-graph)。
      charts.GraphChart,
      components.TooltipComponent,
      components.GridComponent,
      components.LegendComponent,
      renderers.CanvasRenderer,
    ]);
    // Bind the assembled core into the wrapper via a closure component so the
    // caller never has to pass `echarts` itself.
    const Bound = React.forwardRef<
      unknown,
      {
        option: EChartsOption;
        style?: React.CSSProperties;
        className?: string;
        notMerge?: boolean;
        // [T-091] 事件透传(图谱节点/边点击);echarts-for-react 原生支持。
        onEvents?: Record<string, (params: unknown) => void>;
      }
    >(function BoundECharts(props, ref) {
      return (
        <ReactEChartsCoreImpl
          ref={ref as never}
          echarts={echarts}
          notMerge={props.notMerge ?? true}
          lazyUpdate
          option={props.option}
          style={props.style}
          className={props.className}
          onEvents={props.onEvents}
        />
      );
    });
    return Bound;
  },
  {
    ssr: false,
    loading: () => (
      <div
        data-slot="echarts-loading"
        aria-hidden="true"
        className="h-full w-full animate-pulse rounded-md bg-surface-subtle"
      />
    ),
  },
);

// ---------------------------------------------------------------------------
// Design-token reader — resolve CSS custom properties off the live DOM so the
// charts use the project palette and follow light / dark theme.
// ---------------------------------------------------------------------------

const FALLBACK_TOKENS: Readonly<Record<string, string>> = {
  "--color-brand": "#6d4aff",
  "--color-brand-soft": "#f2efff",
  "--color-chart-1": "#6d4aff",
  "--color-chart-2": "#4f7cff",
  "--color-chart-3": "#12b76a",
  "--color-chart-4": "#f79009",
  "--color-chart-5": "#c840d8",
  "--color-border": "#e6e6ef",
  "--color-foreground": "#1a1a24",
  "--color-muted-foreground": "#6b7280",
  "--color-surface": "#ffffff",
};

export interface ChartTokens {
  brand: string;
  brandSoft: string;
  chart: ReadonlyArray<string>;
  border: string;
  foreground: string;
  mutedForeground: string;
  surface: string;
}

const TOKEN_NAMES: ReadonlyArray<string> = [
  "--color-brand",
  "--color-brand-soft",
  "--color-chart-1",
  "--color-chart-2",
  "--color-chart-3",
  "--color-chart-4",
  "--color-chart-5",
  "--color-border",
  "--color-foreground",
  "--color-muted-foreground",
  "--color-surface",
];

function readToken(name: string): string {
  if (typeof window === "undefined") return FALLBACK_TOKENS[name] ?? "#000";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || FALLBACK_TOKENS[name] || "#000";
}

/**
 * External-store subscription (`useSyncExternalStore`): subscribe attaches a
 * MutationObserver on `<html class>` so a theme flip (the `.dark` toggle)
 * re-snapshots the palette; getSnapshot serializes the current token reads.
 * Using the external-store hook (rather than setState-in-effect) is the React 19
 * idiom for syncing with a platform API and avoids cascading-render lint.
 */
function subscribeTokens(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function tokenSnapshot(): string {
  return TOKEN_NAMES.map(readToken).join("|");
}

// SSR snapshot: fallback palette (stable string) so hydration matches.
const SERVER_SNAPSHOT = TOKEN_NAMES.map((n) => FALLBACK_TOKENS[n] ?? "#000").join("|");

/**
 * Read the review chart palette from the live DOM design tokens, re-reading when
 * the theme flips. SSR-safe: returns the fallback palette on the server.
 */
export function useChartTokens(): ChartTokens {
  const snapshot = React.useSyncExternalStore(
    subscribeTokens,
    tokenSnapshot,
    () => SERVER_SNAPSHOT,
  );
  return React.useMemo<ChartTokens>(() => {
    const parts = snapshot.split("|");
    const at = (i: number): string => parts[i] ?? "#000";
    return {
      brand: at(0),
      brandSoft: at(1),
      chart: [at(2), at(3), at(4), at(5), at(6)],
      border: at(7),
      foreground: at(8),
      mutedForeground: at(9),
      surface: at(10),
    };
  }, [snapshot]);
}

// ---------------------------------------------------------------------------
// EChart — the public client-only renderer.
// ---------------------------------------------------------------------------

export interface EChartProps {
  readonly option: EChartsOption;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  /** Test / styling hook; forwarded to the wrapping element. */
  readonly testId?: string;
  /** [T-091] echarts 事件映射(如 { click: handler });图谱节点/边交互用。 */
  readonly onEvents?: Record<string, (params: unknown) => void>;
}

export function EChart({ option, className, style, testId, onEvents }: EChartProps) {
  return (
    <div
      data-slot="echart"
      data-testid={testId}
      className={className}
      style={style}
    >
      <ReactEChartsCore
        option={option}
        style={{ height: "100%", width: "100%" }}
        onEvents={onEvents}
      />
    </div>
  );
}
