import * as React from "react";
import type { Metadata } from "next";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "注册 · CreatorOS",
};

// Register page (P2 — 用户注册真账号). Mirrors the login page: lives OUTSIDE the
// (creator) layout group so it carries none of the authenticated shell chrome
// and no session guard — a brand-new user reaches it unauthenticated. The form
// is a client island; unlike login it reads no search params, so no Suspense
// boundary is required.
export default function RegisterPage(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold">CreatorOS</h1>
          <p className="text-sm text-muted-foreground">创建你的账号</p>
        </header>
        <RegisterForm />
      </div>
    </main>
  );
}
