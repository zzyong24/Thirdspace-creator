// Media-root resolution (item B) — the single place that turns a stored
// storage_config.root_path (possibly empty, possibly `~`-prefixed) into a
// concrete absolute directory. Used by BOTH the per-ctx object-storage factory
// (so uploads land under the user's chosen root) AND the blob route (so it reads/
// writes the same on-disk location). Pure except for reading os.homedir() / env.
import * as os from "node:os";
import * as path from "node:path";

// The hard default media root when a user has no custom path: ~/CreatorOS/media.
export function defaultMediaRoot(): string {
  return path.join(os.homedir(), "CreatorOS", "media");
}

/**
 * Resolve a stored root_path to an absolute directory:
 *   - empty / whitespace → the default ~/CreatorOS/media,
 *   - a leading `~` / `~/...` → expanded against os.homedir(),
 *   - otherwise → path.resolve()'d as given.
 */
export function resolveRootPath(rootPath: string | null | undefined): string {
  const raw = (rootPath ?? "").trim();
  if (raw.length === 0) return defaultMediaRoot();
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    return path.resolve(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

// The blob route has NO session, so it resolves ONE process-level media root:
// CREATOROS_MEDIA_ROOT env when set, else the default. The local-fs backend
// stores every user's bytes under this root keyed by the (globally-unique)
// storageKey, so a single root is correct for read/write on the route.
export function blobRouteRoot(): string {
  return resolveRootPath(process.env.CREATOROS_MEDIA_ROOT);
}
