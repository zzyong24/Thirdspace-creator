/**
 * Shared loading state for the (creator) segment.
 *
 * Renders a deterministic skeleton inside the AppShell's main frame. No
 * random durations, no layout shift. The shared visual follows the
 * foundation tokens and is reused by every page (D-007).
 */
export default function CreatorLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="页面加载中"
      data-slot="creator-loading"
      className="flex flex-col gap-section-gap p-page-gutter"
    >
      <div className="h-6 w-48 rounded-control bg-surface-subtle" />
      <div className="grid grid-cols-1 gap-card-gap md:grid-cols-3">
        <div className="h-24 rounded-card bg-surface" />
        <div className="h-24 rounded-card bg-surface" />
        <div className="h-24 rounded-card bg-surface" />
      </div>
      <div className="h-64 rounded-card bg-surface" />
    </div>
  );
}
