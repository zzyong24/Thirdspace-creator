// Media-root resolution (item B) — the single place that turns a stored
// storage_config.root_path (possibly empty, possibly `~`-prefixed) into a
// concrete absolute directory. SettingsService uses it for the per-context
// object-storage adapter and for the authenticated blob route's resolved root.
// Pure except for reading os.homedir() / env.
import * as os from "node:os";
import * as path from "node:path";

function configuredMediaRoot(): string | null {
  const configured = (process.env.CREATOROS_MEDIA_ROOT ?? "").trim();
  return configured ? resolveExplicitRootPath(configured) : null;
}

function resolveExplicitRootPath(raw: string): string {
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    return path.resolve(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

// The default for an account without a saved storage root. The environment
// value selects a physical location only; it does not grant workspace access.
export function defaultMediaRoot(): string {
  const configured = configuredMediaRoot();
  if (configured) return configured;
  return path.join(os.homedir(), "CreatorOS", "media");
}

/**
 * Resolve a stored root_path to an absolute directory:
 *   - empty / whitespace → CREATOROS_MEDIA_ROOT when set, else ~/CreatorOS/media,
 *   - a leading `~` / `~/...` → expanded against os.homedir(),
 *   - otherwise → path.resolve()'d as given.
 */
export function resolveRootPath(rootPath: string | null | undefined): string {
  const raw = (rootPath ?? "").trim();
  if (raw.length === 0) return defaultMediaRoot();
  return resolveExplicitRootPath(raw);
}

// Compatibility helper for process-level callers. The current authenticated
// blob route resolves its workspace settings root through getStorageRootForRequest.
export function blobRouteRoot(): string {
  return resolveRootPath(process.env.CREATOROS_MEDIA_ROOT);
}
