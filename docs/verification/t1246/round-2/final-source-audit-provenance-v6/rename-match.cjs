'use strict';
// SEMANTIC_BOUNDARY_ALLOW: 只核本次固定授权源/目标tuple和Git展示状态，不做内容相似度或业务选择。
function matchApprovedRename(row,pairs){if(!row||row.status!=='R '||typeof row.file!=='string'||typeof row.source!=='string'||row.file===row.source)return false;return pairs.some(p=>p.status==='R '&&p.file===row.file&&p.source===row.source);}
module.exports={matchApprovedRename};
