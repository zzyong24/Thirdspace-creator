import { cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({
  default: ({
    id,
    strategy,
    dangerouslySetInnerHTML,
  }: ComponentProps<"script"> & {
    strategy?: string;
  }) => (
    <script
      data-script-id={id}
      data-strategy={strategy}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    />
  ),
}));

import { PreHydrationScripts } from "@/app/layout";

afterEach(() => cleanup());

describe("PreHydrationScripts", () => {
  it("uses Next beforeInteractive scripts in theme-then-handshake order", () => {
    const { container } = render(<PreHydrationScripts />);
    const scripts = Array.from(container.querySelectorAll("script"));

    expect(scripts).toHaveLength(2);
    expect(scripts.map((script) => script.dataset.scriptId)).toEqual([
      "creatoros-theme-init",
      "creatoros-handshake-fetch",
    ]);
    expect(
      scripts.every(
        (script) => script.dataset.strategy === "beforeInteractive",
      ),
    ).toBe(true);
  });

  it("keeps theme initialization and guarded same-origin handshake semantics", () => {
    const { container } = render(<PreHydrationScripts />);
    const [theme, handshake] = Array.from(
      container.querySelectorAll("script"),
    ).map((script) => script.textContent ?? "");

    expect(theme).toContain("creatoros.settings.theme");
    expect(theme).toContain("classList.toggle('dark'");
    expect(theme).toContain("dataset.theme");

    expect(handshake).toContain("__CREATOROS_HANDSHAKE_TOKEN__");
    expect(handshake).toContain("x-creatoros-handshake");
    expect(handshake).toContain("new URL(u,O).origin===O");
    expect(handshake).toContain("__CREATOROS_FETCH_PATCHED__");
  });
});
