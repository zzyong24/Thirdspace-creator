"use client";

/**
 * Login client island (Module 00, Task 10).
 *
 * Greenfield surface — the foundation §2 "login page" deliverable; not in
 * roadmap §4 because §4 predates auth. The island owns no routing decisions
 * beyond replace/refresh: it POSTs the entered credentials to the bare auth
 * route `/api/v1/auth/login` (these are auth routes, NOT contract dispatch
 * ops — Module 00 owns no dispatch op), and on success bounces to the `from`
 * target (or `/`) and revalidates the server tree.
 *
 * Security: the raw session token never touches this code — the route sets it
 * as an httpOnly cookie. On a 401 the form renders a single generic inline
 * error that does NOT echo the submitted email (no user enumeration — SPEC
 * §20, mirrors the route's identical-message guard).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LOGIN_ENDPOINT = "/api/v1/auth/login";
// Generic copy — intentionally identical for unknown-email and wrong-password
// so the surface leaks no account-existence signal (SPEC §20).
const GENERIC_ERROR = "邮箱或密码不正确，请重试。";

export function LoginForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        // Any non-2xx (401 invalid creds, 422 validation) collapses to the
        // same generic message — never surface the server copy verbatim, it
        // could carry detail we do not want to render.
        setError(GENERIC_ERROR);
        return;
      }

      const from = searchParams.get("from") ?? "/";
      router.replace(from);
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
      data-testid="login-form"
      className="flex w-full flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-sm font-medium">
          邮箱
        </label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-sm font-medium">
          密码
        </label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>

      {error ? (
        <p
          id="login-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        登录
      </Button>
    </form>
  );
}
