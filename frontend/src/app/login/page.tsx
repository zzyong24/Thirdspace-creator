import * as React from "react";
import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "登录 · CreatorOS",
};

// Login page (Module 00, Task 10). Lives OUTSIDE the (creator) layout group
// so it carries none of the authenticated shell chrome and no session guard
// (the guard lives in the (creator) layout — Task 11). The form is a client
// island; it is wrapped in <Suspense> because it reads `useSearchParams`
// (the `from` redirect target), which Next requires to be suspense-bounded.
export default function LoginPage(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold">CreatorOS</h1>
          <p className="text-sm text-muted-foreground">登录以继续</p>
        </header>
        <React.Suspense fallback={null}>
          <LoginForm />
        </React.Suspense>
      </div>
    </main>
  );
}
