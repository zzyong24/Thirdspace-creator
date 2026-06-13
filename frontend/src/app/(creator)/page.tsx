/**
 * Root CreatorOS page. Renders the Dashboard placeholder inside the shared
 * AppShell. The visible dashboard layout is implemented in a later task;
 * for now we expose the container that downstream tests and the smoke
 * suite rely on.
 */
export default function DashboardPage() {
  return (
    <main data-app="creatoros" data-page="dashboard">
      <div>Hello world!</div>
    </main>
  );
}
