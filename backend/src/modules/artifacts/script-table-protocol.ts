/**
 * SEMANTIC_BOUNDARY_ALLOW: 只解码用户明确编辑的固定分镜表协议；不判断内容、角色或素材。
 * 整表识别成功才转换，contentText 仍由调用方原样保存；无资料不编口播。
 */
function cells(line: string): string[] | null {
  const value = line.trim();
  if (!value.startsWith("|") || !value.endsWith("|")) return null;
  const result: string[] = [];
  let cell = "";
  for (let i = 1; i < value.length - 1; i++) {
    const char = value[i]!;
    if (char === "\\" && value[i + 1] === "|" && i + 1 < value.length - 1) {
      cell += "|";
      i++;
    } else if (char === "|") {
      result.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  result.push(cell.trim());
  return result;
}

export function decodeScriptTable(text: string): Record<string, unknown> | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
  if (lines[0] === "# 分镜脚本") lines.shift();
  if (lines.length < 3) return null;
  const header = cells(lines[0]!);
  const four = ["#", "口播", "画面", "字幕"];
  const six = ["#", "结构角色", "口播", "画面", "字幕", "时长"];
  const expected = header?.length === 4 ? four : six;
  if (!header || header.length !== expected.length || header.some((cell, i) => cell !== expected[i])) return null;
  const separator = cells(lines[1]!);
  if (!separator || separator.length !== header.length || separator.some(cell => !/^:?-{3,}:?$/.test(cell))) return null;
  const sections: Array<{id: string; heading: string; body: string}> = [];
  const narration: string[] = [];
  const scriptTableNarration: Record<string, string> = {};
  for (const [index, line] of lines.slice(2).entries()) {
    const row = cells(line);
    if (!row || row.length !== header.length || !/^[1-9]\d*$/.test(row[0]!)) return null;
    const decode = (value: string) => value.replace(/<br\s*\/?\s*>/gi, "\n");
    const voiceover = decode(row[header.length === 4 ? 1 : 2]!);
    const visual = decode(row[header.length === 4 ? 2 : 3]!);
    const subtitle = decode(row[header.length === 4 ? 3 : 4]!);
    const role = header.length === 6 ? row[1]! : "";
    const time = header.length === 6 ? row[5]! : "";
    // 空口播仍是合法制作段，不用画面或字幕补成口播；整表至少有一段实际口播。
    narration.push(voiceover);
    scriptTableNarration[`script-saved-${index}`] = voiceover;
    const label = voiceover ? voiceover.slice(0, 16) : `分镜 ${index + 1}`;
    sections.push({id: `script-saved-${index}`,
      heading: `${index + 1}. ${label}${role ? ` · ${role}` : ""}${time ? `（${time}）` : ""}`,
      body: [voiceover && `口播：${voiceover}`, visual && `画面：${visual}`, subtitle && `字幕：${subtitle}`].filter(Boolean).join("\n")});
  }
  if (!narration.some(value => value.trim())) return null;
  return {sections, transcript: narration.join("\n"), scriptTableProtocol: "labeled-storyboard-v1", scriptTableNarration};
}

/** SEMANTIC_BOUNDARY_ALLOW: 已标记分镜的字段语法解码，不做内容判断。 */
export function syncScriptTableTranscript(data: Record<string, unknown>, changedSectionId: string): Record<string, unknown> {
  if (data.scriptTableProtocol !== "labeled-storyboard-v1" || !Array.isArray(data.sections)) return data;
  const original = data.scriptTableNarration;
  if (!original || typeof original !== "object" || Array.isArray(original)) return data;
  const scriptTableNarration: Record<string, string> = {...original as Record<string, string>};
  const transcript = data.sections.map((section: unknown) => {
    if (!section || typeof section !== "object" || typeof (section as {body?:unknown}).body !== "string") return "";
    const id = (section as {id?:unknown}).id;
    if (typeof id !== "string") return "";
    // 未改段保留表格字段原值，不重解析其口播中恰好出现的制作标签。
    if (id !== changedSectionId) return typeof scriptTableNarration[id] === "string" ? scriptTableNarration[id]! : "";
    const body = (section as {body:string}).body;
    const lines = body.replace(/\r\n?/g, "\n").split("\n");
    // 无标签整段来自用户明确替换正文；有标签则仅采集口播字段及其续行。
    if (!lines.some(line => /^(口播|画面|字幕)[：:]/.test(line.trim()))) {scriptTableNarration[id] = body; return body;}
    const voiceover: string[] = [];
    let collecting = false;
    for (const line of lines) {
      const label = line.trim().match(/^(口播|画面|字幕)[：:](.*)$/);
      if (label) {
        collecting = label[1] === "口播";
        if (collecting) voiceover.push(label[2]!.trim());
      } else if (collecting) voiceover.push(line);
    }
    scriptTableNarration[id] = voiceover.join("\n");
    return scriptTableNarration[id];
  }).join("\n");
  return {...data, transcript, scriptTableNarration};
}
