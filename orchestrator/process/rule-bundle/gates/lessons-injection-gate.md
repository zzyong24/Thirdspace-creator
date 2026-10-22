# Gate — lessons-injection(唯一人确认门)

> ④进化引擎**唯一** blocking 人介入点。`candidate→rule`、`observation→PAT` 三条晋升路径**共用此门**,不各开一版。其余晋升(B/C 源入库的自动放行等)不经此门。

## 何时触发
reconcile `--consolidate` 提议一批 PROPOSE(candidate→rule / observation→PAT)后,人逐条过此门。**限量 ≤5 条/轮**(按 severity × 证据强度排序,超额留到下轮)。

## 四闸(全过才放行,任一不过 → 退回 candidate/observation)
1. **verifiable-end-state 闸**:晋升为 `rule` 的 LED 必须给出**非 manual 的可执行 GuardCheck**(能写进 `reconcile.config.json` 的 `lessons[].check`,复发时 exit≠0)。写不出可执行判据 → 不得升 rule(留 candidate)。PAT 晋升须给出 BUILD-FORCE/BORROW-GATE 可观测判据。
2. **land-the-test 红证据**:必须附"先红"证据 —— 该 GuardCheck 在复现态下确实 exit≠0 的命令 + 输出(如 LED-001 的 `touch .env.local && git add -f .env.local` 后 check 非零)。无红证据 = 没证明守卫真能挡。
3. **diff 留痕**:接线 diff(写进 `lessons[]` / `PATTERNS.md` stage 映射 / `LESSON_LEDGER.md` Status 流转)必须留在 DECISION_LOG / commit,可追溯。
4. **可回滚**:晋升是纯追加(Status 流转 + lessons[] 增条),误判可逆(降回 candidate / quarantine),不就地改历史。

## 通过后(inject,必须与 capture 成对)
- `candidate→rule`:GuardCheck 写进 `reconcile.config.json` 的 `lessons[]`;Status 改 `rule`;复用 stage-router 第 6.5 步使其落入 ≤7 条检索窗口。
- `observation→PAT`:落新 PAT 卡 + 进 `PATTERNS.md` 的 stage→PAT 映射。
- 两者都在 `LESSON_LEDGER.md` 追加 Status 流转行(append-only)。

## 拒绝
任一闸不过 → 写一行拒绝理由进 DECISION_LOG,LED/observation 留原态,**不删数据**。
