export default function Home() {
  return (
    <main className="page-shell">
      <section className="foundation-card" aria-labelledby="page-title">
        <p className="eyebrow">ScopeDelta</p>
        <h1 id="page-title">Application foundation is ready.</h1>
        <p className="introduction">
          This placeholder confirms that the web application can be developed,
          tested, and built while the product workflow is delivered in later
          issues.
        </p>
        <div className="status" aria-label="Foundation status">
          <span className="status-dot" aria-hidden="true" />
          <span>Web application online</span>
        </div>
      </section>
    </main>
  );
}
