---
id: MOD-002
kind: module
title: 可配置纯 LLM 适配层(供应商无关 complete())
problem_tag: [llm, provider-abstraction]
when_to_use: 非工具型 AI 节点要走供应商无关的 LlmProvider.complete(),用 .env.local 或 DB 配置切换 Anthropic / 中继(如 MiniMax),不硬编码 SDK
when_not_to_use: 需要工具调用 / agent 循环 → 用 Agent SDK,不是本适配层
keywords: [llm, provider, anthropic, openai_chat, adapter, resolve, apiFormat, bearer, x-api-key]
status: active
verified: true
winner: true
superseded_by: null
provenance:
  source: A
  origin_repo: ~/Workbase/Thirdspace-creator
  origin_commit: 664f1354cf2b01d48127a0266ae9e407357c9eb4
  evidence: "CreatorOS task #102-109;MiniMax live smoke 真 JSON 返回;provider/resolve/parse/adapter 各带单测(CreatorOS frontend/src/server/ai/llm/*.test.ts)"
license: PROPRIETARY(用户自有 · Thirdspace-creator)
files: [./files/provider.ts, ./files/anthropic-adapter.ts, ./files/resolve.ts, ./files/parse.ts]
example: ./example/example.test.ts
---

# MOD-002 — 可配置纯 LLM 适配层

## 何时用 / 何时不用
见 frontmatter。核心:`provider.ts`(LlmProvider 接口 + 按 `apiFormat` 选适配器的工厂 + `createLlmCompleter`)、`anthropic-adapter.ts`(可配置 baseURL + bearer/x-api-key)、`resolve.ts`(3 层降级:DB 行 > `.env.local` > 内置)、`parse.ts`(parseJsonLoose / extractText / buildSystem)。

## 接法(复用骨架)
1. vendor 4 文件,按 `apiFormat` 工厂接你的供应商。
2. 凭据走 `resolve.ts` 三层降级,不在代码里硬编码 key。
3. 非工具节点调 `createLlmCompleter()(...)`;要工具 / agent 的另走 Agent SDK。

## 坑
- `openai_chat` 适配器在原仓是桩(抛异常);要支持需补实现。
- 中继(MiniMax 等)用 bearer,官方用 x-api-key,`resolve` 要分清。

## 在 skill 内可跑的 example
本仓 example 见 `./example/example.test.ts`(`node process/assets-runner.mjs --only MOD-002` 判绿:parseJsonLoose 剥围栏 + 供应商无关 `complete()`,SDK 全 mock,零外部依赖)。

## license
用户自有代码,vendor 进同属用户的 skill 仓,无第三方再分发义务。
