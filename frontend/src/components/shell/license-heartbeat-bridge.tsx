"use client";

/**
 * [T-372 L3] 心跳桥 —— Rust 授权心跳判定 → 前端「立即跳激活页」。
 *
 * Rust 壳的心跳循环(license.rs startup_license_task:内测 60min / 买断 30 天)每轮复校后
 * 广播 `creatoros://license-decision`。本组件挂在 (creator)/layout 里监听:
 *   · 收到 `licensed=false`(内测到期硬跳 / 离线超 24h / 心跳命中 revoked)→ 立即
 *     router.replace("/activate"),不等用户下次导航才被服务端门(activation-gate)拦。
 *   · 挂载时先经 IPC `license_last_decision` 补读初始态(webview 挂载晚于 Rust 启动查,
 *     单靠事件会漏第一发)。
 *   · 买断码 fail-open:离线/心跳失败时 Rust 判定仍是 licensed=true,本桥自然不动作;
 *     买断签名撤销 → updatesBlocked(设置页更新入口旁提示),也不在此跳转 —— 码型语义
 *     全在 Rust,本桥只认 licensed 布尔(SPEC §9「前端只拿结果」)。
 *
 * web / SSR:shell-license 封装内 isDesktopRuntimeClient() 短路返回 null → 本桥零副作用
 * (P5 不变式:web 绝不被授权门卡住)。渲染输出恒为 null(纯行为组件)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  fetchLastShellDecision,
  subscribeShellDecision,
} from "@/lib/shell-license";

export function LicenseHeartbeatBridge(): null {
  const router = useRouter();

  React.useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      // 初始态:补读最近判定(启动查已跑完而事件早已发过的情形)。
      const initial = await fetchLastShellDecision();
      if (!disposed && initial && initial.licensed === false) {
        router.replace("/activate");
      }
      // 常驻订阅:心跳/复校每轮广播,licensed=false 即刻跳激活页。
      unlisten = await subscribeShellDecision((decision) => {
        if (decision.licensed === false) {
          router.replace("/activate");
        }
      });
      // 竞态:订阅完成前组件已卸载 → 立即退订,不留悬挂监听。
      if (disposed && unlisten) {
        unlisten();
        unlisten = null;
      }
    })();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, [router]);

  return null;
}
