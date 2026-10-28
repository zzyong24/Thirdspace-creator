// 状态语义只由 emoji 决定；仅清理紧随其后的矛盾标准标签。
const labels = { '📋': ['待办'], '🔨': ['进行中'], '✅': ['完成', '已完成'], '⏸️': ['搁置', '暂停', '已暂停'], '⛔': ['审核FAIL', '阻塞'] };
export function normalizeStatusLabel(cell, target) {
  return cell.replace(/(📋|🔨|✅|⏸️?|⛔)(.*)/, (all, symbol, rest) => {
    const next = target ?? (symbol === '⏸' ? '⏸️' : symbol);
    const match = rest.match(/^(\s*)(待办|进行中|已完成|完成|已暂停|搁置|暂停|审核FAIL|阻塞)(?=$|[\s·（(，,:：;；])/);
    return next + (match && !labels[next]?.includes(match[2]) ? rest.slice(match[0].length) : rest);
  });
}
