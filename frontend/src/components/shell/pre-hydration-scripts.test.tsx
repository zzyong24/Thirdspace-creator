import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import RootLayout from "@/app/layout";
import { handshakeHeaders } from "@/lib/handshake-client";
import { HANDSHAKE_HEADER } from "@/lib/handshake-client";

const layoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
const handshakeSource = readFileSync(
  join(process.cwd(), "src/lib/handshake-client.ts"),
  "utf8",
);
const rustSource = readFileSync(
  join(process.cwd(), "src-tauri/src/lib.rs"),
  "utf8",
);
const tauriConfig = JSON.parse(
  readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
) as { app: { security: { csp: string | null } } };
const remoteCapability = JSON.parse(
  readFileSync(
    join(process.cwd(), "src-tauri/capabilities/remote-sidecar.json"),
    "utf8",
  ),
) as { permissions: string[] };

afterEach(() => cleanup());

describe("RootLayout CSP contract", () => {
  it("does not render application-owned inline scripts", () => {
    const { container } = render(<RootLayout>content</RootLayout>);
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(layoutSource).not.toContain("next/script");
    expect(layoutSource).not.toContain("dangerouslySetInnerHTML");
    expect(layoutSource).not.toContain("__CREATOROS_HANDSHAKE_TOKEN__");
  });

  it("does not expose handshake credentials through a page-readable API", () => {
    expect(handshakeHeaders()).toEqual({});
    expect("__CREATOROS_HANDSHAKE_TOKEN__" in globalThis).toBe(false);
    expect(HANDSHAKE_HEADER).toBe("x-creatoros-handshake");
    expect(handshakeSource).not.toContain(".__CREATOROS_HANDSHAKE_TOKEN__");
    expect(rustSource).not.toContain("window.__CREATOROS_HANDSHAKE_TOKEN__");
    expect(rustSource).toContain("/api/v1/local/handshake-session");
  });

  it("pins non-empty CSP and keeps remote capability minimal", () => {
    const csp = tauriConfig.app.security.csp;
    expect(typeof csp).toBe("string");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(remoteCapability.permissions).not.toContain("updater:default");
    expect(remoteCapability.permissions).not.toContain("process:default");
    expect(remoteCapability.permissions).not.toContain("opener:default");
    expect(remoteCapability.permissions).toContain("allow-relaunch-app");
  });
});
