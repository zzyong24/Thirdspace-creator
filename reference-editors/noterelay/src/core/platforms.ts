import type { PlatformId } from "../types";

export const PLATFORM_IDS: readonly PlatformId[] = ["wechat", "toutiao", "rednote", "x"];

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  wechat: "公众号",
  toutiao: "头条号",
  rednote: "小红书",
  x: "X"
};

export const ACCOUNT_LABELS: Record<PlatformId, string> = {
  wechat: "公众号名称",
  toutiao: "头条号名称",
  rednote: "小红书账号",
  x: "X 账号"
};
