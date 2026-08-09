"use client";

import { useEffect } from "react";

import { reportClientDiagnostic } from "@/lib/client-diagnostics";

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    void reportClientDiagnostic("root_error", error, error.digest);
  }, [error]);
  return (
    <html lang="zh-CN">
      <body>
        <main role="alert" style={{ padding: 32, fontFamily: "sans-serif" }}>
          <h1>CreatorOS 暂时无法继续</h1>
          <p>本机已记录不含正文与密钥的诊断编号。你可以重试；若仍失败，请在设置中打开诊断日志。</p>
          {error.digest ? <p>错误编号：{error.digest}</p> : null}
          <button type="button" onClick={reset}>重试</button>
        </main>
      </body>
    </html>
  );
}
