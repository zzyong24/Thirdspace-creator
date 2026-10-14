/**
 * Contract tests for the Settings page (Task 25 / page-specs §17).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning:
 *  - The TopHeader renders in `global` mode with the canonical
 *    page title "设置" and description "账号、偏好与系统"
 *    (configured by `(creator)/shell-router.tsx`).
 *  - The sidebar marks "设置" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003, NOT `storage`).
 *  - SettingsTabs renders 5 tabs in the approved order
 *    (account / preferences / appearance / integrations / storage).
 *  - SettingsGrid contains MainSettings in order
 *      AccountInformationCard → PreferenceSettingsCard → SystemSettingsCard
 *    and SettingsRail in order
 *      StorageUsageCard → ModelConfigurationCard
 *    (page-specs §17 "组件树").
 *  - Form rows follow the "label + control" compact pattern.
 *  - The page is wrapped in the shared AppShell with exactly one
 *    Sidebar and one TopHeader — no second Shell is created.
 *  - Controls have fixture-only local state. No team, no subscription
 *    detail page, no server persistence (D-001 + page-specs §17
 *    "禁止改变").
 *
 * The component is a Server Component. The test renders it inside
 * the shared AppShell the same way `(creator)/layout.tsx` does so
 * the header-mode / sidebar-active / single-shell assertions run
 * against the same DOM a real route render would produce.
 */

import * as React from "react";
import { cleanup, render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// Stub `next/link` so we can assert href values without the Next.js
// runtime mounting a router.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The settings interactive island (preference + model cards) calls
// `useRouter()` and the typed `client` for its needs-backend wiring
// (Settings module Step 5). Stub both so the structural render runs
// without a Next router context or a real HTTP transport.
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  // [T-132] SettingsDialog 读 ?highlight 做深链定位;测试无 query → 返回空 params。
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    getReportingStatus: vi.fn().mockResolvedValue({consentVersion:1,diagnostics:{scope:"diagnostics",accountId:null,accountLabel:null,platform:null,accountActive:true,enabled:false,needsReconsent:false,consentEpoch:0,changedAt:null,queuedCount:0},accounts:[],preparationAvailable:true,uploadAvailable:false}),
    getModelRouting: vi.fn().mockResolvedValue({schemaVersion:1,revision:0,choices:null,legacyExecutionEngine:'pi',effectiveChoices:{},capabilities:[]}),
    putModelRouting: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({assistantExecutionEngine:'pi'}),
    patchPreferences: vi.fn().mockResolvedValue({}),
    putModel: vi.fn().mockResolvedValue({}),
    putChannelModelCredential: vi.fn().mockResolvedValue({}),
    testModelConnection: vi.fn().mockResolvedValue({ ok: true, detail: "已连通" }),
    patchProfile: vi.fn().mockResolvedValue({}),
    putStorage: vi.fn().mockResolvedValue({}),
    // AccountBindingCard (T-032a) pulls status on mount + calls loginDouyin on click.
    statusDouyin: vi.fn().mockResolvedValue({ loggedIn: false }),
    loginDouyin: vi.fn().mockResolvedValue({ loggedIn: true }),
  },
}));


// 显式测试操作：legacy GET 不造 effectiveChoices；打开原配置必须真实选择来源、再点配置。
// 这里不点击来源保存，不发 routing PUT，不模拟官方模型调用。
function openSourceConfiguration(family:string,source='self') {
 const row=document.querySelector(`[data-model-family="${family}"]`);
 if(!row)return;
 const select=row.querySelector('select') as HTMLSelectElement;
 if(select.value!==source)fireEvent.change(select,{target:{value:source}});
 const button=row.querySelector('button[aria-label^="配置"]') as HTMLButtonElement;
 if(button&&button.getAttribute('aria-expanded')!=='true')fireEvent.click(button);
}
function modelAuthorityInTree(node:React.ReactNode):import('./settings-page').ModelAuthorityState|undefined {
 if(!React.isValidElement<Record<string,unknown>>(node))return undefined;
 if(node.props.modelAuthority)return node.props.modelAuthority as import('./settings-page').ModelAuthorityState;
 let found:import('./settings-page').ModelAuthorityState|undefined;
 React.Children.forEach(node.props.children as React.ReactNode,child=>{found??=modelAuthorityInTree(child);});return found;
}
function render(...args:Parameters<typeof rtlRender>) {
 const tree=rtlRender(...args),authority=modelAuthorityInTree(args[0]);
 const caps:Record<string,string>={text:'default',vision:'asset.classify',image:'image.generate',video:'video.generate',audio:'transcribe.audio',embed:'knowledge.search.embed'};
 for(const [family,capability] of Object.entries(caps))openSourceConfiguration(family,(document.querySelector(`[data-model-family="${family}"] select`) as HTMLSelectElement)?.value||((authority?.capabilities as Record<string,{authority?:string}>|undefined)?.[capability]?.authority==='channel'?'official':'self'));
 const textSource=(document.querySelector('[data-model-family="text"] select') as HTMLSelectElement)?.value||(authority?.capabilities?.default?.authority==='channel'?'official':'self');openSourceConfiguration('text',textSource);
 return tree;
}

type SettingsPageProps = React.ComponentProps<
  typeof import("./settings-page").SettingsPage
>;

// The (creator)/layout already mounts the shared AppShell. For the
// unit test we replicate that wrapper so the "Settings active in
// sidebar" / single-shell checks run against the same DOM shape a
// real page render would produce.
async function renderSettings(overrides: Partial<SettingsPageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { SettingsPage } = await import("./settings-page");
  return render(
    <AppShell
      pathname="/settings"
      headerMode="global"
      pageTitle="设置"
      pageDescription="账号、偏好与系统"
    >
      <SettingsPage {...overrides} />
    </AppShell>,
  );
}

describe("SettingsPage", () => {
  beforeEach(async()=>{const {loadAssistantEngine}=await import('@/features/copilot/assistant-engine');const {loadModelRouting}=await import('@/features/copilot/assistant-engine');await loadModelRouting(true);});
  afterEach(() => {
    cleanup();
  });

  it("[T-715] 下发到设置页前移除受管服务品牌、协议和接口地址", async () => {
    const { sanitizeModelAuthorityForClient } = await import("./settings-page");
    const projected = sanitizeModelAuthorityForClient({
      authority: "channel",
      outcome: "configured",
      action: "当前权益已配置 3/4 类模型，其余由你配置",
      capabilities: {
        default: {
          capability: "default",
          authority: "channel",
          serviceId: "omnihi-main",
          serviceName: "OmniHi 模型服务",
          provider: "openai-compatible",
          modelName: "MiniMax M3",
          model: "minimax-m3",
          baseUrl: "https://api.omnihi.ai/openai",
          hasSecret: true,
          optionId: "minimax-m3",
          modelOptions: [
            { id: "minimax-m3", name: "MiniMax M3", model: "minimax-m3" },
          ],
        },
      },
      services: [
        {
          serviceId: "omnihi-main",
          serviceName: "OmniHi 模型服务",
          hasSecret: true,
          credentialSource: "activation_managed",
          portalUrl: "https://omnihi.ai",
          purchaseUrl: "https://omnihi.ai/buy",
          rechargeUrl: "https://omnihi.ai/recharge",
          helpUrl: "https://omnihi.ai/help",
        },
      ],
    });

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("OmniHi");
    expect(serialized).not.toContain("omnihi-main");
    expect(serialized).not.toContain("openai-compatible");
    expect(serialized).not.toContain("api.omnihi.ai");
    expect(serialized).toContain("MiniMax M3");
    expect(serialized).toContain("managed-ai-credits");
  });

  it('T-1238只保留本次公开用户服务的opaque映射，媒体可合法配Key且未知/受管ID仍不下发',async()=>{
    const {sanitizeModelAuthorityForClient}=await import('./settings-page');
    const capability=(kind:'transcribe.audio'|'video.generate'|'image.generate',serviceId:string)=>({capability:kind,authority:'channel' as const,serviceId,serviceName:'内部实现名',provider:'internal-provider',modelName:'已保存媒体模型',baseUrl:'https://internal.invalid/v1',hasSecret:false});
    const projected=sanitizeModelAuthorityForClient({authority:'channel',outcome:'configured',action:'原能力',capabilities:{'transcribe.audio':capability('transcribe.audio','public-media-service'),'video.generate':capability('video.generate','not-public'),'image.generate':capability('image.generate','managed-internal')},services:[{serviceId:'public-media-service',serviceName:'内部实现名',hasSecret:false,credentialSource:'user_input',portalUrl:null,purchaseUrl:null,rechargeUrl:null,helpUrl:null},{serviceId:'managed-internal',serviceName:'受管实现名',hasSecret:true,credentialSource:'activation_managed',portalUrl:null,purchaseUrl:null,rechargeUrl:null,helpUrl:null}]});
    expect(projected?.capabilities?.['transcribe.audio']?.serviceId).toBe('public-media-service');expect(projected?.capabilities?.['video.generate']?.serviceId).toBeNull();expect(projected?.capabilities?.['image.generate']?.serviceId).toBeNull();
    expect(projected?.capabilities?.['transcribe.audio']).toMatchObject({serviceName:null,provider:null,baseUrl:null});const serialized=JSON.stringify(projected);expect(serialized).not.toContain('内部实现名');expect(serialized).not.toContain('internal-provider');expect(serialized).not.toContain('internal.invalid');expect(serialized).not.toContain('managed-internal');
  });

  it("[T-679] 受管语音转文字只向页面投影业务名称，不暴露实现模型", async () => {
    const { sanitizeModelAuthorityForClient } = await import("./settings-page");
    const projected = sanitizeModelAuthorityForClient({
      authority: "channel",
      outcome: "configured",
      action: "当前权益已提供语音转文字",
      capabilities: {
        "transcribe.audio": {
          capability: "transcribe.audio",
          authority: "channel",
          serviceId: "qwen-asr-main",
          serviceName: "internal-service",
          provider: "qwen",
          modelName: "语音转文字",
          model: "qwen3-asr-flash",
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          hasSecret: true,
          optionId: "qwen3-asr-flash",
          modelOptions: [
            {
              id: "qwen3-asr-flash",
              name: "语音转文字",
              model: "qwen3-asr-flash",
            },
          ],
        },
      },
      services: [],
    });

    const serialized = JSON.stringify(projected);
    expect(serialized).toContain("语音转文字");
    expect(serialized.toLowerCase()).not.toContain("qwen");
    expect(serialized).not.toContain("dashscope");
    expect(serialized).not.toContain("qwen-asr-main");
  });

  it("mounts the TopHeader in global mode with the settings title", async () => {
    const { container } = await renderSettings();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("global");
    const heading = container.querySelector(
      '[data-slot="header-page-heading"]',
    );
    expect(heading).not.toBeNull();
    expect(heading!.textContent ?? "").toContain("设置");
    expect(heading!.textContent ?? "").toContain("账号、偏好与系统");
  });

  it("marks the Settings nav item as the active page in the sidebar", async () => {
    // 设置弹窗 modal 打开后,Radix 给背景 AppShell(含 sidebar)加 aria-hidden,
    // getByRole(走可访问树)便够不到 nav。sidebar 仍在 DOM 里、仍把 /settings 标为
    // 当前页 —— 直接用 DOM 查询断言。
    const { container } = await renderSettings();
    const nav = container.querySelector('nav[aria-label="主要导航"]');
    expect(nav).not.toBeNull();
    const active = nav!.querySelector('[aria-current="page"]');
    expect(active).not.toBeNull();
    expect(active!.getAttribute("href")).toBe("/settings");
    expect(active!.textContent?.trim()).toBe("设置");
  });

  it("uses the assistant contextual-card variant (NOT storage)", async () => {
    const { container } = await renderSettings();
    const assistant = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    const storage = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    expect(assistant).not.toBeNull();
    expect(storage).toBeNull();
  });

  // The settings content now lives in a centered Dialog (Radix Portal → body),
  // so dialog-internal queries go through `document` rather than the render
  // container. The dialog opens by default.
  it("renders the settings dialog with 7 vertical tabs in the approved order", async () => {
    await renderSettings();
    const tabs = document.querySelector('[data-slot="settings-tabs"]');
    expect(tabs).not.toBeNull();
    const triggers = Array.from(
      tabs!.querySelectorAll('[role="tab"]'),
    ).map((node) => node.textContent?.trim() ?? "");
    expect(triggers).toEqual([
      "账户",
      "偏好",
      "外观",
      "模型配置",
      "数据服务",
      // T-077a:技能管理页签(SPEC 2026-07-03 §1.1)。
      "技能",
      "存储",
    ]);
  });

  it("opens as a centered dialog (not a full-page flood layout)", async () => {
    await renderSettings();
    const dialog = document.querySelector('[data-slot="settings-dialog"]');
    expect(dialog).not.toBeNull();
    // Left vertical tab nav + right scrollable panels area both exist.
    expect(dialog!.querySelector('[data-slot="settings-tabs"]')).not.toBeNull();
    expect(
      dialog!.querySelector('[data-slot="settings-panels"]'),
    ).not.toBeNull();
  });

  it("mounts every settings card (account/preference/system/storage/model)", async () => {
    await renderSettings();
    // All panels are force-mounted so the full inventory is present regardless
    // of the active tab.
    const expectedSlots = [
      "account-information-card",
      "preference-settings-card",
      "system-settings-card",
      "storage-usage-card",
      "model-configuration-card",
      // Multimodal (image / video) model cards — SPEC 2026-07-01 M3.
      "multimodal-image-card",
      "multimodal-video-card",
    ];
    for (const slot of expectedSlots) {
      expect(
        document.querySelector(`[data-slot="${slot}"]`),
      ).not.toBeNull();
    }
  });

  it("[T-645] 只锁渠道完整返回的能力，未返回的 ASR 仍可由用户配置", async () => {
    await renderSettings({
      modelAuthority: {
        authority: "channel",
        outcome: "configured",
        action: "渠道已接管 1/4 类模型，其余由你配置",
        capabilities: {
          default: {
            capability: "default",
            authority: "channel",
            serviceId: "relay",
            serviceName: "统一中转服务",
            provider: "minimax",
            modelName: "MiniMax-M3",
            baseUrl: "https://relay.example/v1",
            hasSecret: false,
          },
        },
        services: [
          {
            serviceId: "relay",
            serviceName: "统一中转服务",
            hasSecret: false,
            portalUrl: null,
            purchaseUrl: null,
            rechargeUrl: "https://growth.example/recharge",
            helpUrl: null,
          },
        ],
      },
    });
    const status = document.querySelector(
      '[data-slot="model-authority-status"]',
    );
    expect(status).toBeNull();
    expect(document.querySelector('#model-source-text')).toHaveValue('official');
    expect(document.querySelector('#model-source-audio')).toHaveValue('self');
    expect(document.querySelector('[data-slot=\"model-capability-source\"]')).not.toBeNull();
    expect(
      document.querySelector('[data-slot="model-configuration-card"]'),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-slot="channel-managed-model-card"][data-capability="default"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-slot="multimodal-audio-card"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-slot="channel-model-service-credential"]'),
    ).not.toBeNull();
  });
  it("[T1278/T701] 官方缺渠道身份只阻塞官方该行，不伪造就绪或清自配",async()=>{
    await renderSettings({modelAuthority:{authority:'local',outcome:'activation_scope_missing',action:'授权缺少渠道信息，无法同步受管模型'}});
    openSourceConfiguration('text','official');
    const current=document.querySelector('[data-slot="model-source-configuration"]:not([hidden])');
    expect(current).toHaveTextContent('当前官方配置尚未取得');
    expect(current).not.toHaveTextContent('模型已就绪');
    expect(current?.querySelector('[data-slot="model-secret-input"]')).toBeNull();
    openSourceConfiguration('text','self');expect(document.querySelector('[data-slot="model-configuration-card"]')).not.toBeNull();
  });

  it("[T-679] 按 Growth 下发顺序展示真实模型名和 model，移除旧选择时提示已回退", async () => {
    await renderSettings({
      modelAuthority: {
        authority: "channel",
        outcome: "configured",
        action: "渠道已接管 3/4 类模型，其余由你配置",
        capabilities: {
          default: {
            capability: "default",
            authority: "channel",
            serviceId: "omnihi-main",
            serviceName: "OmniHi 模型服务",
            provider: "openai-compatible",
            modelName: "MiniMax M3",
            model: "minimax-m3",
            baseUrl: "https://api.omnihi.ai/openai",
            hasSecret: true,
            optionId: "minimax-m3",
            selectionNotice: "原模型已不再提供，已切换为 MiniMax M3（minimax-m3）",
            modelOptions: [
              { id: "minimax-m3", name: "MiniMax M3", model: "minimax-m3" },
              { id: "gpt-5-6-terra", name: "GPT 5.6 Terra", model: "gpt-5.6-terra" },
            ],
          },
        },
        services: [],
      },
    });
    const select = document.querySelector(
      'select[aria-label="文本创作与结构化使用模型"]',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(Array.from(select!.options).map((option) => option.textContent)).toEqual([
      "MiniMax M3",
      "GPT 5.6 Terra",
    ]);
    expect(select!.value).toBe("minimax-m3");
    expect(document.body.textContent).toContain("原模型已不再提供");
  });

  it("[T-645] 渠道只提供 ASR 时，文本模型仍保留用户本地表单", async () => {
    await renderSettings({
      modelAuthority: {
        authority: "channel",
        outcome: "configured",
        action: "渠道已接管 1/4 类模型，其余由你配置",
        capabilities: {
          "transcribe.audio": {
            capability: "transcribe.audio",
            authority: "channel",
            serviceId: "asr-service",
            serviceName: "ASR 服务",
            provider: "xiaomi-mimo",
            modelName: "mimo-v2.5-asr",
            baseUrl: "https://api.xiaomimimo.com/v1",
            hasSecret: true,
          },
        },
        services: [],
      },
    });
    expect(
      document.querySelector('[data-slot="model-configuration-card"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-slot="multimodal-audio-card"]'),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-slot="channel-managed-model-card"][data-capability="transcribe.audio"]',
      ),
    ).not.toBeNull();
  });

  it("renders form rows with the compact label + control pattern", async () => {
    await renderSettings();
    const main = document.querySelector('[data-slot="main-settings"]');
    expect(main).not.toBeNull();
    // Account panel + preference panel together have the form rows; assert the
    // label/control pattern across the whole dialog.
    const rows = document.querySelectorAll('[data-slot="settings-form-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of Array.from(rows)) {
      const label = row.querySelector('[data-slot="form-row-label"]');
      const control = row.querySelector('[data-slot="form-row-control"]');
      expect(label).not.toBeNull();
      expect(control).not.toBeNull();
    }
  });

  it("renders StorageUsageCard with a progress bar", async () => {
    await renderSettings();
    const storage = document.querySelector(
      '[data-slot="storage-usage-card"]',
    );
    expect(storage).not.toBeNull();
    const bar = storage!.querySelector('[data-slot="progress-bar"]');
    expect(bar).not.toBeNull();
  });

  // [FE-H02] fixture(读取失败/SSR 的兜底)不再伪造模型/占用:数据缺失诚实置空/置 0,
  // 绝不把不存在的 claude-opus-4-8 / 18GB/64GB 当真。
  describe("honest fallback (FE-H02)", () => {
    it("fixture 兜底不伪造模型与占用(provider/model 空、占用置 0、无分布)", async () => {
      const { buildSettingsViewModel } = await import("@/fixtures/selectors");
      const vm = buildSettingsViewModel();
      expect(vm.model.provider).toBe("");
      expect(vm.model.modelName).toBe("");
      expect(vm.storage.usedBytes).toBe(0);
      expect(vm.storage.totalBytes).toBe(0);
      expect(vm.storage.breakdown).toHaveLength(0);
    });

    it("无 model/storage props(读取失败态)→ 模型卡输入为空(不预填伪造模型),存储诚实显 0 MB", async () => {
      await renderSettings();
      // 模型卡的供应商 / 模型输入不被伪造值预填(原来 fixture 会填 anthropic / claude-opus-4-8)。
      const provider = document.querySelector(
        "#model-provider",
      ) as HTMLInputElement | null;
      const modelName = document.querySelector(
        "#model-name",
      ) as HTMLInputElement | null;
      expect(provider).not.toBeNull();
      expect(provider!.value).toBe("");
      expect(modelName!.value).toBe("");
      // 存储卡诚实显示已用 0.0 GB(数据缺失置 0),绝不显伪造的 18GB/64GB。
      const storage = document.querySelector(
        '[data-slot="storage-usage-card"]',
      ) as HTMLElement;
      // [T-360①] 自适应单位:零用量显「0 MB」(旧 0.0 GB 会把 MB 级真值也抹成 0)。
      expect(storage.textContent ?? "").toContain("0 MB");
      expect(storage.textContent ?? "").not.toContain("18.0 GB");
    });
  });

  it("keeps the page inside the single AppShell — no second Sidebar/TopHeader", async () => {
    const { container } = await renderSettings();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
    const shells = container.querySelectorAll('[data-slot="app-shell"]');
    expect(shells).toHaveLength(1);
  });

  it("renders the page-internal main region with the settings page marker", async () => {
    const { container } = await renderSettings();
    const main = container.querySelector('main[data-page="settings"]');
    expect(main).not.toBeNull();
  });

  // [T-167] 激活状态卡(账户页签)。desktop 有激活态 → 四态徽章 + 授权类型/到期/机器码;
  // web/未装配(activation undefined)→ 诚实空态「激活为桌面端功能」,绝不假装已激活。
  describe("ActivationStatusCard (T-167)", () => {
    it("web / 未装配(activation undefined)→ 诚实空态卡「桌面端专属」", async () => {
      await renderSettings();
      const card = document.querySelector('[data-slot="activation-status-card"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute("data-activation-available")).toBe("false");
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("unavailable");
      expect(badge?.textContent).toContain("桌面端专属");
      expect(card!.textContent).toContain("激活为桌面端功能");
    });

    it("已激活(active)→ 绿徽章 + 授权类型/到期/机器码/最后在线校验", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "MACHINE-abcdef0123456789-XYZ",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
        },
      });
      const card = document.querySelector('[data-slot="activation-status-card"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute("data-activation-available")).toBe("true");
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("active");
      expect(badge?.textContent).toContain("已激活");
      // 授权类型:TIME → 时间型;到期显日期;机器码截断 + 完整码在 title。
      expect(
        document.querySelector('[data-slot="activation-license-mode"]')
          ?.textContent,
      ).toBe("时间型");
      expect(
        document.querySelector('[data-slot="activation-expires-at"]')
          ?.textContent,
      ).toBe("2027-12-31");
      const machine = document.querySelector(
        '[data-slot="activation-machine-id"]',
      );
      expect(machine?.getAttribute("title")).toBe("MACHINE-abcdef0123456789-XYZ");
      // [T-372 L3] 上次在线确认:绝对日期 + 挂载后补相对天数(「X 天前」)。
      expect(
        document.querySelector('[data-slot="activation-last-check"]')
          ?.textContent,
      ).toContain("2026-07-06");
      // [T-534] null 入口诚实显示“当前未提供”，不推断 lifecycle、不回退官网。
      expect(
        document.querySelector('[data-slot="activation-purchase-link"]'),
      ).toBeNull();
      expect(screen.getByText("购买：当前未提供")).toBeInTheDocument();
      expect(screen.getByText("续费：当前未提供")).toBeInTheDocument();
    });

    it("[T-534] 商业售后/下载与购买/续费分离展示", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-ch",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
        },
        channelLinks: {
          purchaseUrl: null,
          renewalUrl: null,
          channelSupportUrl: "https://agent.example.com/support?q=1#help",
          downloadUrl: "https://downloads.example.com/latest?q=mac#download",
        },
      });
      expect(
        document
          .querySelector('[data-slot="activation-channel-support-link"]')
          ?.getAttribute("href"),
      ).toBe("https://agent.example.com/support?q=1#help");
      expect(
        document
          .querySelector('[data-slot="activation-download-link"]')
          ?.getAttribute("href"),
      ).toBe("https://downloads.example.com/latest?q=mac#download");
      expect(screen.queryByText("打开反馈渠道")).not.toBeInTheDocument();
    });

    it("[T-396b] 渠道 purchaseUrl 下发 → 购买/续期入口跳渠道链接", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-ch",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
        },
        channelLinks: {
          purchaseUrl: "https://agent.example.com/buy",
          renewalUrl: null,
          channelSupportUrl: null,
          downloadUrl: null,
        },
      });
      const link = document.querySelector(
        '[data-slot="activation-purchase-link"]',
      );
      expect(link).not.toBeNull();
      expect(link?.getAttribute("href")).toBe("https://agent.example.com/buy");
      // 渠道链接绝不含官方购买页。
      expect(link?.getAttribute("href")).not.toContain("aitongban");
    });

    it("永久激活(expiresAt=null)→ 授权类型「永久激活」+ 到期「永久」", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-perm",
          licenseMode: "PERMANENT",
          expiresAt: null,
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
        },
      });
      expect(
        document.querySelector('[data-slot="activation-license-mode"]')
          ?.textContent,
      ).toBe("永久激活");
      expect(
        document.querySelector('[data-slot="activation-expires-at"]')
          ?.textContent,
      ).toBe("永久");
    });

    it("离线宽限(grace)→ 黄徽章 + 到期「离线宽限中」", async () => {
      await renderSettings({
        activation: {
          status: "grace",
          machineId: "M-grace",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-06-01T00:00:00.000Z",
        },
      });
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("grace");
      expect(badge?.textContent).toContain("离线宽限");
      expect(
        document.querySelector('[data-slot="activation-expires-at"]')
          ?.textContent,
      ).toBe("离线宽限中");
    });

    it("已过期(expired)→ 红徽章「已过期」", async () => {
      await renderSettings({
        activation: {
          status: "expired",
          machineId: "M-exp",
          licenseMode: "TIME",
          expiresAt: "2026-01-01T00:00:00.000Z",
          activatedAt: "2025-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2025-12-01T00:00:00.000Z",
        },
      });
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("expired");
      expect(badge?.textContent).toContain("已过期");
    });

    // ── [T-372 L3] 上次在线确认「X 天前」/ 未知 + 内测宽限倒计时行 ────────────────
    it("[L3] 上次在线确认:有记录 → 「X 天前(日期)」相对文案", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-l3",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
          lastSeenAt: "2026-07-06T00:00:00.000Z",
          graceSeconds: 86_400,
          revoked: false,
        },
      });
      const row = document.querySelector('[data-slot="activation-last-check"]');
      expect(row?.textContent).toContain("天前");
      expect(row?.textContent).toContain("2026-07-06");
    });

    it("[L3] 上次在线确认:无记录(null)→ 诚实「未知」,行不藏", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-l3",
          licenseMode: "TIME",
          expiresAt: null,
          activatedAt: null,
          lastOnlineCheckAt: null,
          lastSeenAt: null,
          graceSeconds: null,
          revoked: false,
        },
      });
      const row = document.querySelector('[data-slot="activation-last-check"]');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain("未知");
    });

    it("[L3] 内测离线宽限(grace)→ 显倒计时行;无壳层实时判定(web/单测)→ 诚实「未知」", async () => {
      await renderSettings({
        activation: {
          status: "grace",
          machineId: "M-grace",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-06-01T00:00:00.000Z",
          lastSeenAt: "2026-06-01T00:00:00.000Z",
          graceSeconds: 86_400,
          revoked: false,
        },
      });
      const countdown = document.querySelector(
        '[data-slot="activation-grace-countdown"]',
      );
      expect(countdown).not.toBeNull();
      // 单测/web 无 Tauri 壳 → 拿不到实时判定 → 不臆造秒数,显「未知」。
      expect(countdown?.textContent).toBe("未知");
    });

    it("[L3] 非宽限态(active)→ 不渲染倒计时行", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-l3",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
          lastSeenAt: null,
          graceSeconds: 86_400,
          revoked: false,
        },
      });
      expect(
        document.querySelector('[data-slot="activation-grace-countdown"]'),
      ).toBeNull();
    });
  });
});
