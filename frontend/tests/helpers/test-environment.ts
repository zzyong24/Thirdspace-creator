import { expect, test as base } from "@playwright/test";
import {
  type ExternalNetworkAttempt,
  formatExternalNetworkAttempts,
  recordExternalNetworkAttempt,
} from "./network-policy";

export const test = base.extend({
  context: async ({ context }, provide) => {
    const externalNetworkAttempts: ExternalNetworkAttempt[] = [];

    await context.route("**/*", async (route) => {
      const url = route.request().url();

      if (
        recordExternalNetworkAttempt(externalNetworkAttempts, "http", url)
      ) {
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });

    await context.routeWebSocket("**/*", async (webSocket) => {
      const url = webSocket.url();

      if (
        recordExternalNetworkAttempt(
          externalNetworkAttempts,
          "websocket",
          url,
        )
      ) {
        await webSocket.close({
          code: 1008,
          reason: "External network requests are disabled in browser tests.",
        });
        return;
      }

      webSocket.connectToServer();
    });

    await provide(context);

    if (externalNetworkAttempts.length > 0) {
      throw new Error(
        formatExternalNetworkAttempts(externalNetworkAttempts),
      );
    }
  },
});

export { expect };
