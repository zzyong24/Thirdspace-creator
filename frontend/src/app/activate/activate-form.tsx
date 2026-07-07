"use client";

// T-147 P5 桌面激活授权 —— 激活页客户端表单。
//
// 输激活码 → POST /api/v1/activate → 成功则跳首页 + 刷新服务端树(gate 复校放行);
// 失败内联显式错误(已过期 / 已被其他设备使用 / 网络错 / 码无效,透传服务端可读 message)。
// 激活码从表单 DOM 读(FormData,不信 state —— autofill 不触发 onChange,同 login-form 踩点)。

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ACTIVATE_ENDPOINT = "/api/v1/activate";
const EMPTY_ERROR = "请输入激活码。";
const GENERIC_ERROR = "激活失败,请检查激活码后重试。";

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
    } catch {
      setError(GENERIC_ERROR);
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
        <label htmlFor="activate-code" className="text-sm font-medium">
          激活码
        </label>
        <Input
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
        <p id="activate-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "激活中…" : "激活"}
      </Button>
    </form>
  );
}
