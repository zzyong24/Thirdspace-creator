/**
 * 抖音链接 → aweme_id 解析([T-055h③/T-063c] 登记已发布)。
 *
 * 纯函数、零网络:只认能从文本里直接读出 aweme_id 的形态 ——
 *   - https://www.douyin.com/video/<id>
 *   - https://www.iesdouyin.com/share/video/<id>
 *   - …?modal_id=<id> / …?aweme_id=<id>(创作者中心/搜索页弹层)
 *   - 直接粘一串视频编号(10–25 位纯数字)
 * v.douyin.com 短链不含 aweme_id,需要网络跳转才能解析 —— 这里诚实返回 null,
 * 由 UI 提示用户粘完整链接或视频编号(不做假解析)。
 */

const PATTERNS: ReadonlyArray<RegExp> = [
  /\/video\/(\d{5,25})/,
  /[?&]modal_id=(\d{5,25})/,
  /[?&]aweme_id=(\d{5,25})/,
];

export function parseDouyinAwemeId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  for (const pattern of PATTERNS) {
    const m = pattern.exec(text);
    if (m?.[1]) return m[1];
  }
  // 直接粘视频编号(纯数字)。
  if (/^\d{10,25}$/.test(text)) return text;
  return null;
}

/** aweme_id → 标准作品页 URL(输入本身是 http 链接时优先保留用户粘的原链)。 */
export function douyinVideoUrl(awemeId: string, pasted?: string): string {
  const raw = (pasted ?? "").trim();
  if (/^https?:\/\//.test(raw)) return raw;
  return `https://www.douyin.com/video/${awemeId}`;
}
