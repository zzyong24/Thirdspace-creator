export type NetworkAttemptType = "http" | "websocket";

export interface ExternalNetworkAttempt {
  type: NetworkAttemptType;
  url: string;
}

const allowedHostnames = new Set(["127.0.0.1", "localhost"]);

export function isLocalTestUrl(value: string | URL): boolean {
  const url = value instanceof URL ? value : new URL(value);

  return allowedHostnames.has(url.hostname);
}

export function recordExternalNetworkAttempt(
  attempts: ExternalNetworkAttempt[],
  type: NetworkAttemptType,
  url: string,
): boolean {
  if (isLocalTestUrl(url)) {
    return false;
  }

  attempts.push({ type, url });
  return true;
}

export function formatExternalNetworkAttempts(
  attempts: ExternalNetworkAttempt[],
): string {
  return [
    "External network requests are disabled in browser tests:",
    ...attempts.map(({ type, url }) => `- ${type}: ${url}`),
  ].join("\n");
}
