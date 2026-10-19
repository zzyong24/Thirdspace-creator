const router = {
  refresh() { window.dispatchEvent(new Event("t1106:fixture-refresh")); },
  push(href: string) { window.dispatchEvent(new CustomEvent("t1106:fixture-navigation", { detail: href })); },
};
export function useRouter() { return router; }
