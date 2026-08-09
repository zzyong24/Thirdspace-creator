# T-722 渠道包未选号 Skill 清单旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-722",
  "journey": "首次启动智溯AI且尚未选择账号时，打开设置技能页仍能查看内置技能；定制保持只读，选择账号后才允许保存账号增量",
  "entry": "/settings",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-SKILLS-LIST", "test_id": "E2E-CHANNEL-SKILLS-01" },
    { "id": "AC-SKILLS-NO-ACCOUNT", "test_id": "E2E-CHANNEL-SKILLS-02" },
    { "id": "AC-SKILLS-NO-ERROR", "test_id": "E2E-CHANNEL-SKILLS-03" }
  ],
  "required_conditions": [
    "fresh-channel-install",
    "no-selected-account",
    "channel-data-isolation",
    "business-domain-independent",
    "installed-desktop-runtime"
  ],
  "watched_paths": [
    "contract/src/resources/settings.ts",
    "backend/src/modules/settings/settings.service.test.ts",
    "backend/src/modules/settings/settings.contract.test.ts",
    "frontend/src/features/settings/skills-data.ts",
    "frontend/src/features/settings/skills-section.tsx",
    "frontend/src/features/settings/skills-section.test.tsx"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [],
  "honesty": [
    "未选号必须显示真实内置技能，不得回退伪造清单",
    "未选号不得伪造账号标识，定制控件必须只读",
    "渠道包继续使用自己的应用数据目录，不得读取 CreatorOS 共用目录",
    "业务域名不参与本地内置技能目录解析"
  ]
}
```
