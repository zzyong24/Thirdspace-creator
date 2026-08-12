# T-793 最新内容 Skill 本地安装包旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-793",
  "journey": "从冻结且已提交的 CreatorOS 源码生成唯一命名的 macOS 本地测试包，校验安装物与源码身份一致，挂载后实际替换安装并启动，在常规和最小窗口下都能看到真实 CreatorOS 窗口",
  "entry": "/Applications/CreatorOS.app",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-LOCAL-PACKAGE-IDENTITY", "test_id": "E2E-T793-01" },
    { "id": "AC-LOCAL-PACKAGE-CONTENT-SKILLS", "test_id": "E2E-T793-02" },
    { "id": "AC-LOCAL-PACKAGE-DMG-INTEGRITY", "test_id": "E2E-T793-03" },
    { "id": "AC-LOCAL-PACKAGE-INSTALL-LAUNCH", "test_id": "E2E-T793-04" }
  ],
  "required_conditions": [
    "frozen-committed-source",
    "package-preflight-green",
    "dmg-mountable",
    "installed-binary-matches-dmg",
    "real-desktop-launch",
    "normal-and-minimum-window"
  ],
  "watched_paths": [
    "ai-worker/src/prompt/templates/script-draft.ts",
    "ai-worker/src/prompt/templates/video-decisions.ts",
    "ai-worker/src/prompt/templates/cover-brief.ts",
    "backend/src/modules/ai-runtime/chat-tools.ts",
    "frontend/scripts/desktop/package-local.mjs"
  ],
  "viewports": [
    { "width": 1280, "height": 800 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [
    {
      "id": "source-package-install",
      "members": [
        "冻结源码提交",
        "发布证明中的提交与产品身份",
        "下载目录唯一 DMG",
        "DMG 内应用",
        "实际安装并运行的应用"
      ]
    }
  ],
  "honesty": [
    "本地测试包使用 ad-hoc 完整签名，不冒充 Apple Developer ID 签名或已公证正式包",
    "本轮只交付本机 DMG 与安装结果，不上传 GitHub、不发布渠道包",
    "安装物必须绑定冻结提交，不能用旧包或开发服务冒充",
    "文案与配图能力仍以候选形式交付，用户采纳后才写入项目",
    "AI 配图不得冒充真实截图、数据、新闻或真实人物事件"
  ]
}
```
