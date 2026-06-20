// Vitest stub for the `server-only` / `client-only` marker packages. Those throw
// by design outside the Next build's react-server/client conditions; vitest sets
// neither, so we alias them to this no-op for tests. The guards remain fully
// active in the Turbopack build (server components resolve them to empty there).
export {};
