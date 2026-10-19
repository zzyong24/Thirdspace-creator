import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "frontend/node_modules/typescript"));
const source = "docs/verification/t1245/automations-run-now-layout.candidate.ts";
const bytes = fs.readFileSync(path.join(root, source));
const ast = ts.createSourceFile(source, bytes.toString(), ts.ScriptTarget.Latest, true);
const helpers = new Map();
let body;
for (const node of ast.statements) {
  if (ts.isFunctionDeclaration(node) && node.name && node.body) helpers.set(node.name.text, node.body);
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "test") {
    if (body) throw new Error("候选必须只有一个独立 case");
    body = node.expression.arguments[1].body;
  }
}
if (!body || ast.parseDiagnostics.length) throw new Error("候选 AST 未完整解析");
const loops = [];
function weigh(node, stack = []) {
  if (ts.isFunctionDeclaration(node)) return 0;
  if (ts.isForStatement(node)) {
    const unit=weigh(node.statement,stack);
    const condition=node.condition?.getText(ast),initial=node.initializer?.getText(ast),increment=node.incrementor?.getText(ast);
    let iterations;
    if(condition==="readNo < 30"&&initial==="let readNo = 0"&&increment==="readNo += 1")iterations=30;
    else if(condition==="index<3"&&initial==="let index=0"&&increment==="index+=1")iterations=3;
    else if(unit===0)return 0; // DOM 同步文本节点遍历不是异步执行预算。
    else throw new Error("未证明的异步循环");
    loops.push({condition,initial,increment,iterations,bodyAwaitSlotsIncludingHelpers:unit,totalSlots:unit*iterations});
    return unit*iterations;
  }
  if(ts.isForOfStatement(node)) {
    const unit=weigh(node.statement,stack);
    if(unit===0)return 0;
    if(!ts.isArrayLiteralExpression(node.expression))throw new Error("异步 for-of 非固定数组");
    const iterations=node.expression.elements.length;
    loops.push({condition:node.expression.getText(ast),iterations,bodyAwaitSlotsIncludingHelpers:unit,totalSlots:unit*iterations});
    return unit*iterations;
  }
  if(ts.isWhileStatement(node)||ts.isDoStatement(node)||ts.isForInStatement(node)) {
    const unit=weigh(node.statement,stack);
    if(unit===0)return 0;
    throw new Error("未展开的异步循环");
  }
  let slots = ts.isAwaitExpression(node) ? 1 : 0;
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helpers.has(node.expression.text)) {
    const name = node.expression.text;
    if (stack.includes(name)) throw new Error("递归 helper 未准入");
    slots += weigh(helpers.get(name), [...stack, name]);
  }
  ts.forEachChild(node, child => { slots += weigh(child, stack); });
  return slots;
}
let outerMs;
let fixedApiRequests = 0;
let loopApiRequests = 0;
function requests(node, inLoop = false) {
  if (ts.isCallExpression(node)) {
    if (node.expression.getText(ast) === "test.setTimeout") outerMs = Number(node.arguments[0].getText(ast).replaceAll("_", ""));
    if (ts.isIdentifier(node.expression) && ["call", "listRuns", "request"].includes(node.expression.text)) {
      if (inLoop) loopApiRequests += 1; else fixedApiRequests += 1;
    }
  }
  ts.forEachChild(node, child => requests(child, inLoop || ts.isForStatement(node)));
}
requests(body);
const slots = weigh(body);
const loopsForBody = structuredClone(loops);
const slotMs = 120_000;
if (outerMs !== 86_400_000) throw new Error("候选外层或循环数漂移");
const conservativeSerialMs = slots * slotMs;
if (outerMs <= conservativeSerialMs) throw new Error("外层未覆盖完整串行预算");
console.log(JSON.stringify({
  source,
  sourceSha256: createHash("sha256").update(bytes).digest("hex"),
  syntaxDiagnostics: ast.parseDiagnostics.length,
  caseCount: 1,
  method: "每个 await 边界均保守计120秒，并递归展开被调用的本地函数 helper；原30轮与新增固定3视口/2筛选/3模板上界/3原控件逐次展开。条件分支和 finally 同 promise 的重复 await 均计入，不把它们误作新请求。同步断言不计执行限时。",
  helpers: Object.fromEntries([...helpers].map(([name, helper]) => [name, weigh(helper, [name])])),
  loops: loopsForBody,
  conservativeSlots: slots,
  slotMs,
  conservativeSerialMs,
  conservativeSerialHours: conservativeSerialMs / 3_600_000,
  candidateOuterMs: outerMs,
  candidateOuterHours: outerMs / 3_600_000,
  reserveMs: outerMs - conservativeSerialMs,
  reserveHours: (outerMs - conservativeSerialMs) / 3_600_000,
  candidateAuthoredApiRequestUpperBound: { fixed: fixedApiRequests, perOriginalIdObservation: loopApiRequests, rounds: 30, total: fixedApiRequests + 30 * loopApiRequests, additionalUiWrites: 2, includingUiWrites: fixedApiRequests + 30 * loopApiRequests + 2, excludes: "UI自带只读历史/状态轮询，不冒称107为全部HTTP上界" },
  actualObservationIntervalsUpperBoundMs: 145_000,
  pendingResponsePromises: "UI启用和runNow各建立一次；finally只等待同一个promise，不重发operation",
  driverBudget: { finiteObservationMs: 432_000_000, finiteObservationHours: 120, originalProjectTimeoutMs: 0, originalAfterHooksTimeoutMs: 0, reason: "Playwright1.60 calculateMaxTimeout任一参数0返回0；共享config保0，仅新单例命令追加--timeout=86400000使AfterHooks声明有限。72小时不覆盖4×24小时原声明。", commandProjectTimeoutMs: 86_400_000, fullDeclaredSlotsWithFiniteProject: ["test/setup/body24h", "AfterHooks24h", "failure WorkerCleanup24h", "tracing24h"], conservativeFullDeclaredMs: 4 * 86_400_000 + 300_000, reserveAfterFullDeclaredMs: 432_000_000 - 4 * 86_400_000 - 300_000, commandBudgetDecisionPendingRoot: false, historicalRootApproved: "2026-10-11父任务明确采用命令侧单例24h+独立driver120h；本脚本仅静态，不执行runtime" },
  scope: "仅候选静态语法/预算观察；不是 TypeScript 类型或运行验收",
  notRun: ["DB", "Next", "browser", "model", "types", "Gate"],
}, null, 2));
