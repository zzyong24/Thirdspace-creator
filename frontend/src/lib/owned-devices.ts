/** T-1072：IPC 只允许展示状态，原生秘密与机器证据留在 Rust。 */
export type OwnedDeviceIntent = "link_owner" | "register_device";
export type OwnedDeviceView = {
  state: "idle" | "waiting" | "linked" | "activated" | "expired" | "unavailable";
  intent: OwnedDeviceIntent | null;
  userCode: string | null;
  verificationUrl: string | null;
  expiresAt: string | null;
  retryAfterSeconds: number | null;
  message: string;
};
const STATES = new Set(["idle", "waiting", "linked", "activated", "expired", "unavailable"]);
export function safeVerificationUrl(raw: string): string {
  const url = new URL(raw);
  if (url.origin !== "https://growth.aitongban.cloud" || url.pathname !== "/products/connect" || url.username || url.password || url.search || !/^#code=[0-9A-HJKMNP-TV-Z]{4}-?[0-9A-HJKMNP-TV-Z]{4}$/.test(url.hash)) throw new Error("请重新打开官方确认页");
  return url.toString();
}
export function parseOwnedDeviceView(raw: unknown): OwnedDeviceView {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("连接状态无法读取，请重试");
  const value = raw as Record<string, unknown>;
  const keys = ["state", "intent", "userCode", "verificationUrl", "expiresAt", "retryAfterSeconds", "message"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value)) || !STATES.has(String(value.state)) || ![null, "link_owner", "register_device"].includes(value.intent as OwnedDeviceIntent | null) || typeof value.message !== "string" || value.message.length > 500) throw new Error("连接状态无法读取，请重试");
  for (const key of ["userCode", "verificationUrl", "expiresAt"]) if (value[key] !== null && typeof value[key] !== "string") throw new Error("连接状态无法读取，请重试");
  if (value.userCode !== null && !/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(String(value.userCode))) throw new Error("连接状态无法读取，请重试");
  if (value.verificationUrl !== null) safeVerificationUrl(String(value.verificationUrl));
  if (value.expiresAt !== null && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(String(value.expiresAt))) throw new Error("连接状态无法读取，请重试");
  if (value.retryAfterSeconds !== null && (!Number.isInteger(value.retryAfterSeconds) || Number(value.retryAfterSeconds) < 1 || Number(value.retryAfterSeconds) > 120)) throw new Error("连接状态无法读取，请重试");
  return value as OwnedDeviceView;
}
export async function ownedDeviceCommand(command: "start" | "poll" | "resume" | "cancel", args?: { intent: OwnedDeviceIntent; deviceLabel?: string; activationCode?: string }): Promise<OwnedDeviceView> {
  const { invoke } = await import("@tauri-apps/api/core");
  return parseOwnedDeviceView(await invoke(`owned_device_${command}`, args));
}
