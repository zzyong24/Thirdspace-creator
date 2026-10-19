export const DESKTOP_RELEASE_CSP: string;
export function desktopReleaseHeaders(env?: Record<string, string | undefined>): Array<{source: string; headers: Array<{key: string; value: string}>}>;
