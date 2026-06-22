/**
 * Default value for the @modal parallel route slot.
 *
 * Renders nothing. Required by Next.js parallel-route conventions so the
 * layout always has a `modal` prop to forward to the AppShell. Intercepted
 * overlay routes (e.g. `(.)projects/new`) are added in Task 8.
 */
export default function CreatorModalDefault() {
  return null;
}
