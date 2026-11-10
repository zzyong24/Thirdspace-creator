import {z} from "zod";

/**
 * 第三批步骤2：生成结果回报引用了哪些知识库条目。
 * 模型只填它在【知识库】段里看到的条目标题原文；后端按本次注入的条目把标题映射成 knowledgeId，
 * 映射不上的一律丢弃（不信任模型自报 ID，防编造来源）。旧结果没有该字段时缺省为空数组。
 */
export const knowledgeCitationsField = z.array(z.string().trim().min(1).max(200)).max(10).default([]);
export const KNOWLEDGE_CITATION_CLAUSE = `【知识来源】输出里的 "sources" 是字符串数组：只列本稿实际用到的【知识库】条目标题，逐字照抄上方给出的标题；没用到知识库就给 []。不得列出上方没有的标题，不得编造来源。`;
