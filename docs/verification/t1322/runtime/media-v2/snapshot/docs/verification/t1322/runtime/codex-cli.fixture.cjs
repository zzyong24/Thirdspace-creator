'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const root = process.argv[2];
const scenario = JSON.parse(fs.readFileSync(path.join(root, 'scenario.json'), 'utf8'));
const audit = value => fs.appendFileSync(path.join(root, 'native-rpc.ndjson'), JSON.stringify({...value, pid: process.pid}) + '\n');
const out = value => process.stdout.write(JSON.stringify(value) + '\n');
const imageMode = process.argv.includes('features.image_generation=true');
const statePath = path.join(root, 'native-state.json');
const read = () => fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {sequence: 0, threads: {}};
const write = value => fs.writeFileSync(statePath, JSON.stringify(value));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4AWP8DwQMQMDEAAUAPfgEADYYS7QAAAAASUVORK5CYII=';
const brief = scenario.kind === 'cover' ? {headline: '留一块空白', subheadline: '', keyPoints: [], visualConcept: '杯子与合上的笔记本摆齐，桌面留出空白。', composition: '物品位于下方，顶部留白。', palette: '温暖纸色'} : {imagePrompt: '白色桌面上，一只稳定的杯子与一本合上的笔记本整齐摆放，中间留出空白区域，柔和侧光，简洁插画，不叠加文字。', altText: '杯子和合上的笔记本旁留出空白。'};
function complete(threadId, turnId) {
  const items = imageMode ? [{id: 'fixture-image-' + turnId, type: 'imageGeneration', status: 'completed', result: png}] : [{id: 'fixture-text-' + turnId, type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(brief)}];
  const turn = {id: turnId, status: 'completed', itemsView: 'full', items};
  const state = read(); state.threads[threadId].turn = turn; write(state);
  out({method: 'thread/tokenUsage/updated', params: {threadId, turnId, tokenUsage: {total: {inputTokens: 7, outputTokens: 5, totalTokens: 12, cachedInputTokens: 0, reasoningOutputTokens: 0}}}});
  for (const item of items) out({method: 'item/completed', params: {threadId, turnId, item}});
  out({method: 'turn/completed', params: {threadId, turn}});
}
async function handle(message) {
  if (!message.method) return;
  audit({method: message.method, imageMode, threadId: message.params?.threadId ?? null, inputKinds: message.method === 'turn/start' ? message.params.input.map(part => part.type) : undefined});
  let result = {};
  if (message.method === 'config/read') {
    const features = {omit_app_server_notification_media: false};
    for (const name of ['apps','plugins','hooks','multi_agent','multi_agent_v2','image_generation','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install']) features[name] = name === 'image_generation' && imageMode;
    if (imageMode) features.code_mode = {enabled: false, direct_only_tool_namespaces: ['image_gen']};
    result = {config: {web_search: 'disabled', features, mcp_servers: {}}};
  } else if (message.method === 'account/read') result = {account: {type: 'chatgpt', planType: 'fixture'}, requiresOpenaiAuth: false};
  else if (message.method === 'modelProvider/capabilities/read') result = {imageGeneration: true, namespaceTools: true};
  else if (message.method === 'model/list') result = {data: [{id: 't1322-fixture-model', isDefault: true, inputModalities: ['text', 'image']}]};
  else if (message.method === 'mcpServerStatus/list') result = {data: [], nextCursor: null};
  else if (message.method === 'thread/start') {
    const state = read(), id = 'fixture-thread-' + (++state.sequence);
    state.threads[id] = {imageMode}; write(state);
    result = {thread: {id}, model: 't1322-fixture-model', modelProvider: 'synthetic'};
  } else if (message.method === 'turn/start') {
    const threadId = message.params.threadId, turnId = 'fixture-turn-' + threadId;
    out({id: message.id, result: {turn: {id: turnId, status: 'inProgress', items: []}}});
    setImmediate(() => {out({method: 'turn/started', params: {threadId, turn: {id: turnId, status: 'inProgress', items: []}}}); complete(threadId, turnId);});
    return;
  } else if (message.method === 'thread/read') {
    const turn = read().threads[message.params.threadId]?.turn;
    if (!turn) throw Error('OWNED_ORIGINAL_TURN_NOT_FOUND');
    result = {thread: {id: message.params.threadId, turns: [turn]}};
  } else if (!['initialize', 'initialized', 'turn/interrupt'].includes(message.method)) throw Error('OWNED_RPC_NOT_ALLOWED');
  if (message.id !== undefined) out({id: message.id, result});
}
readline.createInterface({input: process.stdin}).on('line', line => {try {void handle(JSON.parse(line)).catch(() => process.exit(2));} catch {process.exit(2);}});
