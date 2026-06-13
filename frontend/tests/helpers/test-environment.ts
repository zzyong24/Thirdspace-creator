import { expect, test as base } from "@playwright/test";

const allowedHosts = new Set(["127.0.0.1", "localhost"]);

export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());

      if (!allowedHosts.has(url.hostname)) {
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });

    await context.routeWebSocket("**/*", async (webSocket) => {
      const url = new URL(webSocket.url());

      if (!allowedHosts.has(url.hostname)) {
        await webSocket.close({
          code: 1008,
          reason: "External network requests are disabled in browser tests.",
        });
        return;
      }

      webSocket.connectToServer();
    });

    await provide(context);
  },
});

export { expect };
