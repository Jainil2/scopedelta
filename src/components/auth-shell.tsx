import Link from "next/link";

import { BrandLockup } from "@/components/brand";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}>) {
  return (
    <main className="auth-page" id="main-content">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="auth-header">
        <BrandLockup />
        <Link className="auth-home-link" href="/">
          Back to the public site
        </Link>
      </header>
      <section className="auth-layout" aria-labelledby="auth-title">
        <div className="auth-context">
          <p className="app-eyebrow">{eyebrow}</p>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
          <div className="auth-proof" aria-label="Account protections">
            <span>Verified work identity</span>
            <span>Server-side workspace isolation</span>
            <span>No confidential documents required</span>
          </div>
        </div>
        <div className="auth-form-region">{children}</div>
      </section>
    </main>
  );
}
