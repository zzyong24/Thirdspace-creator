// 一次性存量修正(T-089):导入项目(source='imported')的 title 曾是**整篇文案**
// (douyin-cdp 旧映射 `desc || title` 混用 → ensureImportedProject 直接拿全文当标题)。
// 本脚本按与采集侧 deriveWorkTitle **同一规则**重算短标题:
//   newTitle = 现 title 首行(去首尾空白)按码点截 40 字
// 并把被截断的原全文(即旧 title,就是当时的 desc 存证)落到 brief(仅当 brief 为空,
// 不覆盖用户已写的 brief)—— 文案是创作资产,不随标题截断丢弃。
//
// 幂等:已是短标题(首行截 40 后与现 title 相同)的行跳过;重复跑无变化。
// 只动 projects.title / projects.brief / projects.updated_at;**不动** content_output /
// publication revision 的标题(明细导出按-title 匹配依赖 revision 的完整 caption,
// douyin-work-detail 的首行/前缀兜底层也能匹配短标题,两侧口径都活)。
//
// 用法:
//   tsx backend/scripts/fix-imported-titles.ts            # dry-run,只打印 before/after
//   tsx backend/scripts/fix-imported-titles.ts --apply    # 真写库
// 执行前务必先备份:docker exec creatoros-pg pg_dump -U creatoros -d creatoros -t projects > …

import { createRuntimeDb } from "../src/db";

const APPLY = process.argv.includes("--apply");
const TITLE_MAX = 40; // 与 frontend douyin-cdp DERIVED_TITLE_MAX 同值(同一规则)

const url =
  process.env.DATABASE_URL ??
  "postgresql://creatoros:creatoros@localhost:5432/creatoros";

/** 与采集侧 deriveWorkTitle 的 desc 分支同规则:首行 → trim → 码点截 40。 */
function deriveShortTitle(fullDesc: string): string {
  const firstLine = (fullDesc.split(/[\r\n]/)[0] ?? "").trim();
  return [...firstLine].slice(0, TITLE_MAX).join("");
}

/** 打印用:压平换行 + 截显示宽度(不影响落库值)。 */
function display(s: string, max = 46): string {
  const flat = s.replace(/[\r\n]+/g, "⏎");
  const cps = [...flat];
  return cps.length > max ? `${cps.slice(0, max).join("")}…` : flat;
}

async function main(): Promise<void> {
  const masked = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
  console.log(
    `[fix-imported-titles] mode=${APPLY ? "APPLY(写库)" : "DRY-RUN(只打印)"} db=${masked}`,
  );

  const { pool } = await createRuntimeDb({ connectionString: url });
  try {
    const { rows } = await pool.query<{
      id: string;
      user_id: string;
      title: string;
      brief: string;
    }>(
      `SELECT id, user_id, title, brief FROM projects
       WHERE source = 'imported'
       ORDER BY created_at`,
    );
    console.log(`[fix-imported-titles] imported 项目共 ${rows.length} 条`);

    let changed = 0;
    let skipped = 0;
    let briefFilled = 0;
    const ts = new Date().toISOString();

    for (const row of rows) {
      const oldTitle = row.title;
      const newTitle = deriveShortTitle(oldTitle);
      // 幂等/无信息损失:重算结果与现 title 一致(本就是短标题/占位名)→ 跳过。
      if (!newTitle || newTitle === oldTitle) {
        skipped++;
        continue;
      }
      changed++;
      // 原全文(= 当时的 desc 存证)落 brief,仅当 brief 为空(不覆盖用户已写内容)。
      const fillBrief = row.brief.trim() === "";
      if (fillBrief) briefFilled++;
      console.log(
        `  [${changed}] ${row.id}\n` +
          `      before: ${display(oldTitle)}\n` +
          `      after : ${display(newTitle)}` +
          (fillBrief ? `\n      brief : ← 原全文存证(${[...oldTitle].length} 字)` : ""),
      );
      if (APPLY) {
        if (fillBrief) {
          await pool.query(
            `UPDATE projects SET title = $1, brief = $2, updated_at = $3 WHERE id = $4`,
            [newTitle, oldTitle, ts, row.id],
          );
        } else {
          await pool.query(
            `UPDATE projects SET title = $1, updated_at = $2 WHERE id = $3`,
            [newTitle, ts, row.id],
          );
        }
      }
    }

    console.log(
      `[fix-imported-titles] 完成 —— 重算 ${changed} / 跳过(已是短标题)${skipped} / 全文落 brief ${briefFilled}${APPLY ? "(已写库)" : "(dry-run 未写库,--apply 生效)"}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[fix-imported-titles] 失败:", err);
  process.exitCode = 1;
});
