const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root='/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator';
const e='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/unit-first';
const files=['frontend/src/app/api/v1/local/reset-workspace/route.test.ts','frontend/src/app/api/v1/local/reset-workspace/plan.ts','frontend/src/app/api/v1/local/reset-workspace/route.ts','frontend/src/test/function-key-invariant.test.ts','frontend/src/fixtures/selectors/copilot.ts','backend/src/modules/ai-runtime/chat-assembly.ts','frontend/src/app/api/v1/auth/auth-routes.test.ts','backend/src/modules/identity/identity.service.ts','frontend/src/server/persistence-client.ts'];
const receipt=JSON.parse(fs.readFileSync(e+'/frontend-exit.json'));
const bindings=files.map(p=>({file:path.join(root,p),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}));
const ownedMarker=path.join(receipt.runtimeDirs.app,'reset-pending.json');
fs.writeFileSync(e+'/frontend-path-identity-source-binding.json',JSON.stringify({candidate:receipt.frozenCommit,observedAt:new Date().toISOString(),originalAssertions:true,sourceBindings:bindings,ownedRuntime:{app:receipt.runtimeDirs.app,db:receipt.runtimeDirs.db},resetMarker:{path:ownedMarker,exists:fs.existsSync(ownedMarker),sha256:fs.existsSync(ownedMarker)?crypto.createHash('sha256').update(fs.readFileSync(ownedMarker)).digest('hex'):null},readonlyNoRepairs:true},null,2)+'\n');
fs.writeFileSync(e+'/FRONTEND_PATH_IDENTITY_REVIEW.md',`# 前端路径、明确命令与本机主用户的首轮只读分诊

冻结533224f，完整首次38file/158FAIL原证据保留。以下只核源、receipt及本run自有临时marker；不调用重置、不改用户库、不修源/断言，不把静态因果当复测成功。精确执行源SHA见frontend-path-identity-source-binding.json。

## 重置工作区4例：本run APP目录优先与旧fixture只改DB

原route.test:44只stub CREATOROS_DESKTOP/CREATOROS_DB_DIR，在本例临时reset-ws-route根观察marker。首轮runner真实也注入owned APP_DATA_DIR=${receipt.runtimeDirs.app}及独立DB=${receipt.runtimeDirs.db}，plan:34先用APP再回退DB。三项合法POST因此写本轮owned APP marker而非该例旧tmp，原ENOENT/false均符合这个消费者；第四仅清DB，APP仍有效故200。实际自有APP marker存在=${fs.existsSync(ownedMarker)}，路径/SHA已绑定。无需接触真实安装目录；不应通过删APP支持、改生产返回码或只改断言数字洗绿。

集中最小原route.test：显式隔离两目录env，保新APP优先、旧DB fallback与两者都缺500；保真I/O marker时间/source/幂等、loopback/缺Host/确认词及非桌面零文件。原first4FAIL保留，实际再验仍待。

## functionKey1例：已有精确媒体路由命令不是直接工具名称

原scan73判每个字面functionKey必须在ALL_CHAT_TOOL_NAMES，first仅material.generate.image/video失败。生产chat-assembly:175对这两精确命令拆forcedMaterialKind，:182生成合法context.artifact.text/material.generate序列（文章图片仅material.generate），:210取消直接forcedTool，随后真实tool已注册；前端相同命令也有稿面可达路径。它们不是随意不存在工具被模型忽略，但当前不变量的口径仍按旧‘一命令等于一工具’。

最小候选原function-key-invariant.test：仅按已实现两精确命令映射真实注册工具/相应已存在路由测试，不任意前缀放行，不排除fixture生产模块、不删CTA。保未知命令死链拒绝、至少生产入口与planning.thesis。是否获批别名范围与整条真实命令功能需独评/原公共链验收，不先签产品与测试修复。

## auth3例：真实空库主用户初始化非硬编码canonical

组合根1326 ensureLocalUser；identity.service:298有已存在记录即复用，否则deps.nextId(user)，本轮memory组合根nextId实际user-p-1，密码来自随机字节；resolveLocalContext:192选择持久最早用户。原auth-routes.test仍把无/坏cookie/logout回落身份写为固定CANONICAL_USER_ID(user-zyongzhu)，实际first稳定收到user-p-1。已有canonical用户兼容另原identity integration保留。不能为使旧断言绿恢复可猜seed密码/虚构平台账号、把任意身份当成功。

候选只原auth-routes.test按真实本机主用户读回核ID，保免登录、失效cookie、logout撤销与注册用户登录/凭据不泄露。新空库身份方向的获批SPEC和用户确认仍需主线程独评核；静态行为事实与合同准入结论明确分开，原3FAIL和待实际复验保留。
`);
console.log(JSON.stringify({boundSources:bindings.length,ownedMarkerExists:fs.existsSync(ownedMarker),sourceOrAssertionMutation:false}));
