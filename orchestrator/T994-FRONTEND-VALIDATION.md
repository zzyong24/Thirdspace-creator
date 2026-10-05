# T-994 画布创作旅程验收

## 人话结论

从一件作品的素材区可以直接进入只属于该作品的画布。新画布给出图片、视频和已有素材三个清晰入口；保存后返回作品、账号隔离和版本冲突均在真实浏览器中验证。结果区的保留与关联重试由模拟任务回执驱动，真实素材和作品关联仍走后端；四种模式的真实模型出片由 T-993 的安装版验收负责。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-994",
  "contract_path": "orchestrator/T994-FRONTEND-JOURNEY.md",
  "contract_sha": "1c474edb2283",
  "commit_sha": "43a62a93da2663350f275df3cf8ccd6f73480330",
  "observed_at": "2026-09-29T12:10:03Z",
  "run": {
    "verify_key": "canvas-t994:e2e",
    "command": "CREATOROS_TEST_PORT=3442 pnpm --dir frontend exec playwright test tests/e2e/creative-canvas.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "隔离 PGlite + Playwright 画布旅程 9/9；详细截图与命令结果见 docs/verification/t994-canvas-experience.md"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Next.js 16.2.9 本地开发服务 + Playwright Chromium；独立账号和独立 PGlite",
    "viewports": [
      {"width":1536,"height":1024,"result":"pass"},
      {"width":1024,"height":768,"result":"pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id":"project-and-account","role":"浏览器运行时经真实 dispatch 新建账号、两个作品、项目画布并回读保存状态"},
      {"id":"uploaded-media","role":"真实上传图片和视频，插入画布、读取签名媒体链接并刷新恢复"},
      {"id":"result-adoption-boundary","role":"结果交互用模拟任务回执，保留和项目用料关联使用真实账号素材与后端；首次关联失败后只重试关联"}
    ]
  },
  "levels": {
    "logic":{"status":"pass","evidence_ref":"画布后端服务及升级测试 7/7，制作台相关单测 22/22，TypeScript 与 ESLint 通过"},
    "surface":{"status":"pass","evidence_ref":"docs/verification/t994/ 中的作品入口、空态、素材抽屉、窄桌面与结果操作截图"},
    "journey":{"status":"pass","evidence_ref":"画布 Playwright E2E 9/9，涵盖项目进入、保存返回、隔离、媒体预览、冲突和结果关联重试"},
    "experience":{"status":"not-requested","evidence_ref":"实现者已在浏览器检查视觉与交互，未把自动化结果冒充用户验收"}
  },
  "checks": [
    {"id":"AC-CANVAS-PROJECT-ENTRY","test_id":"E2E-T994-01","result":"pass","evidence_ref":"从作品素材区进入，仅看到本作品画布；新建自动关联；其他作品画布不混入"},
    {"id":"AC-CANVAS-SAFE-RETURN","test_id":"E2E-T994-02","result":"pass","evidence_ref":"改标题后立即返回先保存；另测 CAS 冲突阻止离开并显示恢复提示"},
    {"id":"AC-CANVAS-RESULT-ACTIONS","test_id":"E2E-T994-03","result":"pass","evidence_ref":"模拟任务回执 + 真实素材/后端关联：确认一次，首轮关联失败后重试，成功后按钮禁用"},
    {"id":"AC-CANVAS-ACCOUNT-SCOPE","test_id":"E2E-T993-01","result":"pass","evidence_ref":"切换账号后画布库无原账号画布，原直链返回无权访问"},
    {"id":"AC-CANVAS-MEDIA-PREVIEW","test_id":"E2E-T993-06","result":"pass","evidence_ref":"真实上传图片和视频，画布插入、预览及重开后再次加载"}
  ],
  "coverage": [
    {"condition":"regular-window","result":"pass","evidence_ref":"1536×1024 画布空态和素材抽屉截图","reason":""},
    {"condition":"narrow-window","result":"pass","evidence_ref":"1024×768 截图及图片/视频/素材主操作可见断言","reason":""},
    {"condition":"project-scoped-list","result":"pass","evidence_ref":"同账号另一作品画布被过滤，同时可进入当前账号全部画布","reason":""},
    {"condition":"account-isolation","result":"pass","evidence_ref":"跨账号列表与直链 E2E","reason":""},
    {"condition":"empty-assets","result":"pass","evidence_ref":"抽屉显示 0 件已加载素材及真实素材中心入口","reason":""},
    {"condition":"save-conflict","result":"pass","evidence_ref":"另一窗口版本更新后导航留在当前画布并提供重载动作","reason":""},
    {"condition":"result-link-retry","result":"pass","evidence_ref":"模拟任务确认后注入一次关联失败，再由真实后端完成项目素材关联，确认调用总计一次","reason":""}
  ],
  "tdd_red_ref": "本轮没有伪造实现前 TDD 红测。验收阶段旧缩放用例先因新增引导层改变 DOM 定位而失败，改为明确定位画布世界层后单项和全套通过；结果区模拟任务测试最初因缺响应 meta 被真实 transport 拒绝，补齐协议回执后通过。",
  "open_defects": [],
  "status": "pass"
}
```
