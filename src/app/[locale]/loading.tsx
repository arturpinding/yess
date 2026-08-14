export default function Loading() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="Loading">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton skeleton-card" key={index} />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
