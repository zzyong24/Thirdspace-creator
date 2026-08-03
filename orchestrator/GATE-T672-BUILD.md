# T-672 官网公开信息收口验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-672",
  "contract_path": "docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md",
  "contract_sha": "f80b1f097758",
  "commit_sha": "2a69e1db142f502bc54e7ff1d199d5b8125c00f4",
  "observed_at": "2026-08-03T11:40:00.000Z",
  "run": {
    "verify_key": "website-pricing:test",
    "command": "node --test website/pricing.test.mjs",
    "exit_code": 0,
    "output_ref": "官网公开边界测试通过"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Chromium live HTTPS",
    "viewports": [
      { "width": 1440, "height": 1200, "result": "pass" },
      { "width": 390, "height": 844, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "live-homepage-20260803", "role": "线上公开官网" },
      { "id": "legacy-contact-resource", "role": "历史二维码地址" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "website/pricing.test.mjs" },
    "surface": { "status": "pass", "evidence_ref": "桌面与移动端真实浏览器检查" },
    "journey": { "status": "pass", "evidence_ref": "线上首页返回 200，授权伙伴指引可见，历史二维码返回 404" },
    "experience": { "status": "not-requested", "evidence_ref": "用户要求直接下线，等待其线上复核" }
  },
  "checks": [
    {
      "id": "AC-PUBLIC-NO-PRICE",
      "test_id": "WEB-PUBLIC-01",
      "result": "pass",
      "evidence_ref": "线上首页敏感价格与利润词匹配为 0"
    },
    {
      "id": "AC-PUBLIC-NO-PERSONAL-CONTACT",
      "test_id": "WEB-PUBLIC-02",
      "result": "pass",
      "evidence_ref": "线上首页与部署文本资源的个人联系方式匹配为 0"
    },
    {
      "id": "AC-PARTNER-REFERRAL",
      "test_id": "WEB-PUBLIC-03",
      "result": "pass",
      "evidence_ref": "官网统一显示联系原授权合作伙伴的获取指引"
    },
    {
      "id": "AC-LEGACY-QR-404",
      "test_id": "WEB-PUBLIC-04",
      "result": "pass",
      "evidence_ref": "历史二维码 URL 线上返回 404"
    }
  ],
  "coverage": [
    { "condition": "desktop-layout", "result": "pass", "evidence_ref": "1440x1200 真实浏览器", "reason": "" },
    { "condition": "mobile-layout", "result": "pass", "evidence_ref": "390x844 真实浏览器", "reason": "" },
    { "condition": "no-public-price", "result": "pass", "evidence_ref": "公开边界测试与线上源码扫描", "reason": "" },
    { "condition": "no-personal-contact", "result": "pass", "evidence_ref": "部署输入与线上资源扫描", "reason": "" },
    { "condition": "live-readback", "result": "pass", "evidence_ref": "线上哈希与本地哈希一致", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-672-visible-copy.json",
    "artifact_sha256": "68965ed1d55ced7acfc5c7d0870a6608bcc6ce6688523a3139f0910be9750635"
  },
  "tdd_red_ref": "实现前官网公开展示价格、利润、个人微信、邮箱和二维码，公开边界测试失败",
  "open_defects": [],
  "status": "pass"
}
```

补充证据：官网首页返回 `200`；线上与本地 `index.html` SHA-256 均为
`c6f3684208cb75951c3381265ed3d18d7b734f562c919325d9595c1a4147269e`；历史二维码地址返回
`404`；公开首页和独立管理文本资源的敏感词扫描均为 `0`。
