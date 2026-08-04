"use client";

import * as React from "react";

const ENDPOINT = "/api/v1/local/client-config";
const RETRY_DELAYS_MS = [0, 1_000, 3_000, 10_000] as const;

/**
 * 激活后的渠道配置引导器。
 *
 * 桌面壳完成激活后会整包重启；首次进入登录后布局时在后台拉取 Growth 配置，
 * 同一次请求也会把 activation_managed 子 Key 写入本机加密凭据库。普通页面不等待
 * 网络，失败按有限退避重试；秘密不会进入浏览器响应或组件状态。
 */
export function ChannelConfigBootstrap(): null {
  React.useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async (attempt: number): Promise<void> => {
      if (controller.signal.aborted) return;
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) return;
        const body = (await response.json().catch(() => null)) as {
          retryable?: unknown;
        } | null;
        if (body?.retryable !== true) return;
      } catch {
        if (controller.signal.aborted) return;
      }
      const next = attempt + 1;
      if (next >= RETRY_DELAYS_MS.length) return;
      timer = setTimeout(() => void run(next), RETRY_DELAYS_MS[next]);
    };

    void run(0);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
