"use client";

// T-147 P5 → [T-372 L2] 桌面激活授权 —— 激活页客户端表单。
//
// 桌面壳(Tauri):输激活码 → **IPC `license_activate`**(Rust 校验决策链:验签/防重放/
//   防回拨全在壳层,SPEC §9「前端只拿结果」)→ licensed=true 则跳首页(gate 读 .license 放行)。
// web/dev:沿用 POST /api/v1/activate(web 本无激活门,route 直接放行语义)。
// 失败内联显式错误(已过期 / 已被其他设备使用 / 网络错 / 码无效,透传可读 message);
// 弱验签模式(gate-F2)下 message 自带「签名校验未启用」诚实标注,如实显示。
// 激活码从表单 DOM 读(FormData,不信 state —— autofill 不触发 onChange,同 login-form 踩点)。

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDesktopRuntimeClient } from "@/lib/desktop-updater";

const ACTIVATE_ENDPOINT = "/api/v1/activate";
const EMPTY_ERROR = "请输入激活码。";
const GENERIC_ERROR = "激活失败,请检查激活码后重试。";

// Rust 侧 GateDecision(license.rs,serde camelCase)。前端只消费,不再持有判定逻辑。
interface GateDecision {
  licensed: boolean;
  status: string;
  mode: string;
  expiresAt: string | null;
  revoked: boolean;
  signatureVerified: boolean;
  strictVerify: boolean;
  message: string;
}

// 桌面壳激活:经 Tauri IPC 调 Rust 决策链。动态 import(web 环境 import 即因缺
// __TAURI_INTERNALS__ 报错,同 desktop-updater.ts 的收敛方式)。
async function activateViaShell(code: string): Promise<GateDecision> {
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<GateDecision>("license_activate", { code });
}

export function ActivateForm(): React.JSX.Element {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = new FormData(event.currentTarget);
    const codeValue = String(form.get("code") ?? "").trim();
    if (!codeValue) {
      setError(EMPTY_ERROR);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (isDesktopRuntimeClient()) {
        // [T-372 L2] 桌面壳:Rust 决策链(验签+防重放+防回拨+落 .license 放行权威)。
        const decision = await activateViaShell(codeValue);
        if (!decision.licensed) {
          setError(decision.message || GENERIC_ERROR);
          return;
        }
        // [T-451 gate-F3] 激活成功 → **整包 relaunch**(简化版 graceful restart)。
        //   原因:当前 sidecar 进程持有的 verdict-token mode=activation-only,proxy.ts 只放
        //   /activate 路径;router.replace('/') 也会被 proxy 强 302 回 /activate。让 Rust 壳
        //   在下一轮启动时**重新跑 verdict**(此时 .license 已被 license_activate 更新),重新
        //   签 verdict-bound token mode=licensed。激活页无用户未保存数据,relaunch 无损。
        //   SPEC §4.4 gate-F3 已明确允许方案 b(优雅重启),不做运行时 sidecar kill+respawn
        //   (工程复杂且引入新信任边界模糊点)。
        setError(null); // 清错,进入 loading 语义
        try {
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
          // relaunch 会立即杀本进程,后续代码不会执行;兜底 UX 语义靠 finally 的 submitting=false
          //   (relaunch 前 submitting 仍是 true,按钮显示"激活中…",等价于 loading)。
          return;
        } catch (relaunchErr) {
          // 极端兜底:relaunch 拿不到(dev/无 plugin-process)→ 退回旧路径(router.replace)。
          //   dev 分支本来就走 CREATOROS_DEV_MODE=1 豁免,activation-gate 不看 verdict-token,
          //   router.replace('/') 能正常放行(激活成功后 .license 已更新,gate 逻辑放行)。
          console.warn("[T-451] relaunch 失败,回退 router.replace:", relaunchErr);
          router.replace("/");
          router.refresh();
        }
        return;
      }
      // web/dev:legacy 路由(web 无激活门,route 直接放行语义)。
      const res = await fetch(ACTIVATE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: codeValue }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        // 透传服务端可读 message(激活码已过期 / 已被其他设备使用 / 无法连接授权服务…),
        // 缺失时兜底通用文案。
        setError(data.message || GENERIC_ERROR);
        return;
      }
      // 激活成功 → 回首页,刷新服务端树(gate 复校 active 放行)。
      router.replace("/");
      router.refresh();
    } catch (err) {
      // IPC 层 throw(command 执行失败)也给可读文案。
      setError(err instanceof Error && err.message ? err.message : GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="activate-form"
      className="flex w-full flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="activate-code" className="text-base font-medium">
          激活码
        </label>
        <Input
          className="text-base md:text-base"
          id="activate-code"
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="请输入激活码"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "activate-error" : undefined}
        />
      </div>

      {error ? (
        <p id="activate-error" role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full text-base">
        {submitting ? "激活中…" : "激活"}
      </Button>
    </form>
  );
}
