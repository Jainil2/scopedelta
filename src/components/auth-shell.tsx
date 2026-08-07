import Link from "next/link";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page" id="main-content">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="auth-header">
        <Link className="app-wordmark" href="/">
          <span className="app-brand-mark" aria-hidden="true">
            Δ
          </span>
          ScopeDelta
        </Link>
        <Link className="auth-home-link" href="/">
          Public site
        </Link>
      </header>
      <section className="auth-layout" aria-labelledby="auth-title">
        <div className="auth-context">
          <p className="app-eyebrow">{eyebrow}</p>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
          <p className="auth-boundary">
            Workspaces are isolated by server-side membership checks. Never
            paste contracts or confidential client content into account forms.
          </p>
        </div>
        <div className="auth-form-region">{children}</div>
      </section>
    </main>
  );
}
