export default function ProjectLoading() {
  return (
    <div
      className="route-loading project-route-loading"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      <p>Loading project view…</p>
      <div aria-hidden="true" />
    </div>
  );
}
