"use client";

/**
 * Register client island (P2 — 用户注册真账号).
 *
 * Mirrors the login island (../login/login-form.tsx): a client form that POSTs
 * to the bare auth route `/api/v1/auth/register` (NOT contract dispatch — the
 * registrant has no session yet). On success the route sets the httpOnly session
 * cookie and the new user lands authenticated, so the island bounces to `/` and
 * revalidates the server tree (same flow as a post-login redirect).
 *
 * Security: the raw session token never touches this code — the route sets it as
 * an httpOnly cookie. Unlike login, a 409 (email taken) IS surfaced distinctly so
 * the user can pick another address; all other non-2xx collapse to a generic
 * message.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REGISTER_ENDPOINT = "/api/v1/auth/register";
const EMAIL_TAKEN_ERROR = "该邮箱已被注册，请换一个或直接登录。";
const GENERIC_ERROR = "注册失败，请稍后重试。";

export function RegisterForm(): React.JSX.Element {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
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
      const res = await fetch(REGISTER_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(displayName.trim().length > 0
            ? { displayName: displayName.trim() }
            : {}),
        }),
      });

      if (!res.ok) {
        // 409 → the email is taken; surface it so the user can react. Any other
        // non-2xx collapses to a generic message.
        setError(res.status === 409 ? EMAIL_TAKEN_ERROR : GENERIC_ERROR);
        return;
      }

      // New account created + session cookie set → land authenticated at home.
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
      data-testid="register-form"
      className="flex w-full flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="register-email" className="text-sm font-medium">
          邮箱
        </label>
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "register-error" : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="register-display-name" className="text-sm font-medium">
          昵称（可选）
        </label>
        <Input
          id="register-display-name"
          name="displayName"
          type="text"
          autoComplete="nickname"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="register-password" className="text-sm font-medium">
          密码
        </label>
        <Input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "register-error" : undefined}
        />
      </div>

      {error ? (
        <p
          id="register-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        创建账号
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        已有账号？{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          登录
        </Link>
      </p>
    </form>
  );
}
