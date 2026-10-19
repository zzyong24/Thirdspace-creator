'use strict';
const fs = require('node:fs'), path = require('node:path'), readline = require('node:readline');
const root = process.argv[2];
const scenario = JSON.parse(fs.readFileSync(path.join(root, 'scenario.json'), 'utf8'));
const audit = value => fs.appendFileSync(path.join(root, 'native-rpc.ndjson'), JSON.stringify({...value, pid: process.pid}) + '\n');
const out = value => process.stdout.write(JSON.stringify(value) + '\n');
let tools = [], current, seq = 100, observation = 0;
const pending = new Map();
function request(name, args) {
  if (!tools.some(tool => tool.name === name)) throw Error('OWNED_TOOL_NOT_FROZEN');
  const id = ++seq, toolCallId = 'owned-tool-' + id;
  pending.set(id, {name, toolCallId});
  audit({method: 'owned-tool-request', name, toolCallId, args});
  out({id, method: 'item/tool/call', params: {threadId: current.threadId, turnId: current.turnId, callId: toolCallId, tool: name, namespace: null, arguments: args}});
}
function complete() {
  const item = {id: 'owned-final', type: 'agentMessage', phase: 'final_answer', text: '受控真实采集回执已完成。'};
  current.turn = {id: current.turnId, status: 'completed', itemsView: 'full', items: [item]};
  out({method: 'thread/tokenUsage/updated', params: {threadId: current.threadId, turnId: current.turnId, tokenUsage: {total: {inputTokens: 7, outputTokens: 5, totalTokens: 12, cachedInputTokens: 0, reasoningOutputTokens: 0}}}});
  out({method: 'item/completed', params: {threadId: current.threadId, turnId: current.turnId, item}});
  out({method: 'turn/completed', params: {threadId: current.threadId, turn: current.turn}});
}
async function handle(m) {
  if (m.id !== undefined && !m.method) {
    const job = pending.get(m.id); if (!job) return; pending.delete(m.id);
    const text = m.result?.contentItems?.find(part => part.type === 'inputText')?.text;
    const outcome = text ? JSON.parse(text) : null;
    audit({method: 'owned-tool-reply', name: job.name, success: m.result?.success ?? null, outcome});
    if (!m.result?.success || !outcome || outcome.status !== 'ok') throw Error('OWNED_REAL_TOOL_REJECTED');
    if (job.name === 'collect.plan') {
      if (!outcome.data.targets.some(target => target.id === scenario.sourceId)) throw Error('OWNED_SOURCE_NOT_LISTED');
      request('collect.run', {targetId: scenario.sourceId});
    } else if (outcome.data.ok === true) complete();
    else if (outcome.data.pending && ++observation <= 8) {
      setTimeout(() => request('collect.status', {targetId: scenario.sourceId, runId: outcome.data.runId, observation}), 100);
    } else throw Error('OWNED_COLLECTION_NOT_COMPLETED');
    return;
  }
  if (!m.method) return;
  audit({method: m.method, ...(m.method === 'thread/start' ? {toolNames: (m.params.dynamicTools ?? []).map(tool => tool.name)} : {})});
  let result = {};
  if (m.method === 'config/read') {
    const features = {omit_app_server_notification_media: false};
    for (const x of ['apps','plugins','hooks','multi_agent','multi_agent_v2','image_generation','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install']) features[x] = false;
    result = {config: {web_search: 'disabled', features, mcp_servers: {}}};
  } else if (m.method === 'account/read') result = {account: {type: 'chatgpt', planType: 'fixture'}, requiresOpenaiAuth: false};
  else if (m.method === 'model/list') result = {data: [{id: 't1319-fixture-model', isDefault: true, inputModalities: ['text', 'image']}]};
  else if (m.method === 'mcpServerStatus/list') result = {data: [], nextCursor: null};
  else if (m.method === 'thread/start') {tools = m.params.dynamicTools ?? []; current = {threadId: 'owned-agentic-thread', turnId: 'owned-agentic-turn'}; result = {thread: {id: current.threadId}, model: 't1319-fixture-model', modelProvider: 'synthetic'};}
  else if (m.method === 'turn/start') {
    out({id: m.id, result: {turn: {id: current.turnId, status: 'inProgress', items: []}}});
    setImmediate(() => {
      out({method: 'turn/started', params: {threadId: current.threadId, turn: {id: current.turnId, status: 'inProgress', items: []}}});
      if (scenario.kind === 'unknown') {audit({method: 'owned-drop-after-original-turn'}); setTimeout(() => process.exit(2), 100);}
      else if (scenario.kind === 'foreign-source') request('collect.run', {targetId: scenario.sourceId});
      else if (scenario.kind === 'collect' || scenario.kind === 'budget') request('collect.plan', {limit: 20, offset: 0}); else complete();
    }); return;
  } else if (m.method === 'thread/read') {if (!current?.turn) throw Error('OWNED_ORIGINAL_TURN_MISSING'); result = {thread: {id: current.threadId, turns: [current.turn]}};}
  else if (!['initialize','initialized','turn/interrupt'].includes(m.method)) throw Error('OWNED_RPC_FORBIDDEN');
  if (m.id !== undefined) out({id: m.id, result});
}
readline.createInterface({input: process.stdin}).on('line', line => {try {void handle(JSON.parse(line)).catch(() => process.exit(2));} catch {process.exit(2);}});
